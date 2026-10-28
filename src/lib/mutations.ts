import type { AppData, Mutation } from "./types";

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

const MAX_ACTIVITY = 2000;

/** Pure reducer applying one mutation. Mirrors the database's cascade rules. */
export function applyMutation(data: AppData, m: Mutation): AppData {
  switch (m.type) {
    case "task.upsert":
      return { ...data, tasks: upsert(data.tasks, m.task) };
    case "task.delete":
      return {
        ...data,
        tasks: data.tasks
          .filter((t) => t.id !== m.id)
          .map((t) => (t.dependsOn.includes(m.id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== m.id) } : t)),
        // schedule_blocks.task_id cascades; focus_sessions.task_id is set null.
        blocks: data.blocks.filter((b) => b.taskId !== m.id),
        focusSessions: data.focusSessions.map((s) => (s.taskId === m.id ? { ...s, taskId: null } : s)),
      };
    case "block.upsert":
      return { ...data, blocks: upsert(data.blocks, m.block) };
    case "block.delete":
      return { ...data, blocks: data.blocks.filter((b) => b.id !== m.id) };
    case "focus.add":
      return { ...data, focusSessions: upsert(data.focusSessions, m.session) };
    case "goal.upsert":
      return { ...data, goals: upsert(data.goals, m.goal) };
    case "goal.delete":
      return {
        ...data,
        goals: data.goals.filter((g) => g.id !== m.id),
        tasks: data.tasks.map((t) => (t.goalId === m.id ? { ...t, goalId: null } : t)),
      };
    case "habit.upsert":
      return { ...data, habits: upsert(data.habits, m.habit) };
    case "habit.delete":
      return {
        ...data,
        habits: data.habits.filter((h) => h.id !== m.id),
        habitLogs: data.habitLogs.filter((l) => l.habitId !== m.id),
      };
    case "habitLog.add":
      if (data.habitLogs.some((l) => l.habitId === m.log.habitId && l.date === m.log.date)) return data;
      return { ...data, habitLogs: [...data.habitLogs, m.log] };
    case "habitLog.delete":
      return { ...data, habitLogs: data.habitLogs.filter((l) => l.id !== m.id) };
    case "activity.add": {
      const activity = [...data.activity, m.event];
      return { ...data, activity: activity.length > MAX_ACTIVITY ? activity.slice(-MAX_ACTIVITY) : activity };
    }
    case "profile.update":
      return { ...data, profile: m.profile };
  }
}

export function applyMutations(data: AppData, ms: Mutation[]): AppData {
  return ms.reduce(applyMutation, data);
}
