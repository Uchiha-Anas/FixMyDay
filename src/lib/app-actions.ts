"use client";

import { useAppStore } from "./store";
import type {
  ActivityEvent,
  FocusSession,
  Goal,
  Habit,
  Mutation,
  Profile,
  Recurrence,
  ScheduleBlock,
  Task,
  TaskStatus,
} from "./types";
import { addDays, todayInTz, weekday } from "./time";

export const newId = (): string => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const state = () => useAppStore.getState();
const commit = (ms: Mutation[]) => state().commit(ms);

function activity(type: ActivityEvent["type"], taskId: string | null, title: string): Mutation {
  return { type: "activity.add", event: { id: newId(), type, taskId, title: title.slice(0, 200), at: nowIso() } };
}

export type TaskInput = Partial<Omit<Task, "id" | "createdAt" | "updatedAt" | "completedAt">> & { title: string };

export function buildTask(input: TaskInput): Task {
  const ts = nowIso();
  return {
    id: newId(),
    title: input.title.trim().slice(0, 200),
    description: input.description ?? "",
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    category: input.category ?? "personal",
    tags: input.tags ?? [],
    estimatedMinutes: input.estimatedMinutes ?? 30,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueDate ? (input.dueTime ?? null) : null,
    dependsOn: input.dependsOn ?? [],
    preferredTime: input.preferredTime ?? "any",
    recurrence: input.recurrence ?? "none",
    goalId: input.goalId ?? null,
    completedAt: input.status === "done" ? ts : null,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createTasks(tasks: Task[]): void {
  commit(tasks.flatMap((t) => [{ type: "task.upsert", task: t } as Mutation, activity("task_created", t.id, t.title)]));
}

export function createTask(input: TaskInput): Task {
  const task = buildTask(input);
  createTasks([task]);
  return task;
}

export function updateTask(id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): void {
  const task = state().data.tasks.find((t) => t.id === id);
  if (!task) return;
  const next: Task = { ...task, ...patch, updatedAt: nowIso() };
  if (!next.dueDate) next.dueTime = null;
  const ms: Mutation[] = [{ type: "task.upsert", task: next }];
  // Keep scheduled block titles in sync with the task.
  if (patch.title && patch.title !== task.title) {
    for (const b of state().data.blocks.filter((b) => b.taskId === id)) {
      ms.push({ type: "block.upsert", block: { ...b, title: next.title } });
    }
  }
  commit(ms);
}

function nextOccurrence(rec: Recurrence, base: string, today: string): string {
  const step = (d: string) => {
    if (rec === "daily") return addDays(d, 1);
    if (rec === "weekly") return addDays(d, 7);
    let n = addDays(d, 1);
    while (weekday(n) === 0 || weekday(n) === 6) n = addDays(n, 1);
    return n;
  };
  let next = step(base);
  while (next <= today) next = step(next);
  return next;
}

/** Change status, handling completion timestamps, activity and recurring tasks. */
export function setTaskStatus(id: string, status: TaskStatus): Task | null {
  const { data } = state();
  const task = data.tasks.find((t) => t.id === id);
  if (!task || task.status === status) return null;
  const ts = nowIso();
  const ms: Mutation[] = [];
  let spawned: Task | null = null;

  if (status === "done") {
    const updated: Task = { ...task, status, completedAt: ts, updatedAt: ts };
    if (task.recurrence !== "none") {
      const today = todayInTz(data.profile.timezone);
      spawned = {
        ...task,
        id: newId(),
        status: "todo",
        dueDate: nextOccurrence(task.recurrence, task.dueDate ?? today, today),
        completedAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      updated.recurrence = "none"; // the series continues on the new instance
    }
    ms.push({ type: "task.upsert", task: updated }, activity("task_completed", id, task.title));
    if (spawned) ms.push({ type: "task.upsert", task: spawned });
  } else {
    ms.push({ type: "task.upsert", task: { ...task, status, completedAt: null, updatedAt: ts } });
    if (task.status === "done") ms.push(activity("task_reopened", id, task.title));
  }
  commit(ms);
  return spawned;
}

export function toggleTaskDone(id: string): void {
  const task = state().data.tasks.find((t) => t.id === id);
  if (task) setTaskStatus(id, task.status === "done" ? "todo" : "done");
}

/** Delete a task; returns an undo function that restores it with its blocks and links. */
export function deleteTask(id: string): (() => void) | null {
  const { data } = state();
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;
  const blocks = data.blocks.filter((b) => b.taskId === id);
  const dependents = data.tasks.filter((t) => t.dependsOn.includes(id));
  const focusLinks = data.focusSessions.filter((s) => s.taskId === id);
  commit([{ type: "task.delete", id }, activity("task_deleted", id, task.title)]);
  return () =>
    commit([
      { type: "task.upsert", task },
      ...dependents.map((t): Mutation => ({ type: "task.upsert", task: t })),
      ...blocks.map((b): Mutation => ({ type: "block.upsert", block: b })),
      ...focusLinks.map((s): Mutation => ({ type: "focus.add", session: s })),
    ]);
}

export function upsertBlock(block: ScheduleBlock): void {
  commit([{ type: "block.upsert", block }]);
}

export function upsertBlocks(blocks: ScheduleBlock[]): void {
  commit(blocks.map((block) => ({ type: "block.upsert", block })));
}

export function deleteBlock(id: string): (() => void) | null {
  const block = state().data.blocks.find((b) => b.id === id);
  if (!block) return null;
  commit([{ type: "block.delete", id }]);
  return () => commit([{ type: "block.upsert", block }]);
}

/** Replace planner output for a day: delete `removeIds`, add `blocks`. */
export function applyPlan(removeIds: string[], blocks: ScheduleBlock[], label: string): void {
  commit([
    ...removeIds.map((id): Mutation => ({ type: "block.delete", id })),
    ...blocks.map((block): Mutation => ({ type: "block.upsert", block })),
    activity("plan_generated", null, label),
  ]);
}

export function addFocusSession(session: FocusSession, taskTitle: string | null): void {
  const ms: Mutation[] = [{ type: "focus.add", session }];
  if (session.completed) ms.push(activity("focus_completed", session.taskId, taskTitle ?? "Focus session"));
  commit(ms);
}

export function saveGoal(goal: Goal): void {
  commit([{ type: "goal.upsert", goal }]);
}

export function deleteGoal(id: string): (() => void) | null {
  const { data } = state();
  const goal = data.goals.find((g) => g.id === id);
  if (!goal) return null;
  const linked = data.tasks.filter((t) => t.goalId === id);
  commit([{ type: "goal.delete", id }]);
  return () =>
    commit([{ type: "goal.upsert", goal }, ...linked.map((task): Mutation => ({ type: "task.upsert", task }))]);
}

export function saveHabit(habit: Habit): void {
  commit([{ type: "habit.upsert", habit }]);
}

export function deleteHabit(id: string): (() => void) | null {
  const { data } = state();
  const habit = data.habits.find((h) => h.id === id);
  if (!habit) return null;
  const logs = data.habitLogs.filter((l) => l.habitId === id);
  commit([{ type: "habit.delete", id }]);
  return () =>
    commit([{ type: "habit.upsert", habit }, ...logs.map((log): Mutation => ({ type: "habitLog.add", log }))]);
}

export function toggleHabitLog(habitId: string, date: string): void {
  const { data } = state();
  const existing = data.habitLogs.find((l) => l.habitId === habitId && l.date === date);
  if (existing) {
    commit([{ type: "habitLog.delete", id: existing.id }]);
    return;
  }
  const habit = data.habits.find((h) => h.id === habitId);
  commit([
    { type: "habitLog.add", log: { id: newId(), habitId, date } },
    activity("habit_logged", null, habit?.title ?? "Habit"),
  ]);
}

export function updateProfile(patch: Partial<Profile>): void {
  const profile = { ...state().data.profile, ...patch };
  commit([{ type: "profile.update", profile }]);
}
