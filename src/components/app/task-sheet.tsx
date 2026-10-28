"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Link2, RotateCcw, Timer, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, NativeSelect, PriorityBadge } from "./primitives";
import { useUI } from "@/lib/ui-store";
import { useAppData } from "@/lib/store";
import { buildTask, createTasks, deleteTask, setTaskStatus, updateTask } from "@/lib/app-actions";
import { useClock } from "@/hooks/use-clock";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  RECURRENCES,
  RECURRENCE_LABEL,
  TIMES_OF_DAY,
  TIME_OF_DAY_LABEL,
  type Task,
} from "@/lib/types";
import { formatClock, formatDuration, isoToLocalDate, relativeDayLabel } from "@/lib/time";

type Draft = Omit<Task, "id" | "createdAt" | "updatedAt" | "completedAt">;

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

function draftFrom(task: Partial<Task> | undefined): Draft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    category: task?.category ?? "personal",
    tags: task?.tags ?? [],
    estimatedMinutes: task?.estimatedMinutes ?? 30,
    dueDate: task?.dueDate ?? null,
    dueTime: task?.dueTime ?? null,
    dependsOn: task?.dependsOn ?? [],
    preferredTime: task?.preferredTime ?? "any",
    recurrence: task?.recurrence ?? "none",
    goalId: task?.goalId ?? null,
  };
}

/** Ids of tasks that depend (directly or transitively) on `id`; they can't become its prerequisites. */
function dependentsOf(id: string, tasks: Task[]): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const t of tasks) {
      if (t.dependsOn.includes(cur) && !out.has(t.id)) {
        out.add(t.id);
        stack.push(t.id);
      }
    }
  }
  return out;
}

export function TaskSheet() {
  const sheet = useUI((s) => s.taskSheet);
  const close = useUI((s) => s.closeTaskSheet);
  const data = useAppData();
  const task = sheet?.mode === "edit" ? data.tasks.find((t) => t.id === sheet.taskId) : undefined;
  const key = sheet ? (sheet.mode === "edit" ? sheet.taskId : "new") : "closed";

  return (
    <Sheet open={sheet !== null && (sheet.mode === "new" || !!task)} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        {sheet && (
          <TaskForm
            key={key}
            task={task}
            defaults={sheet.mode === "new" ? sheet.defaults : undefined}
            onDone={close}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskForm({ task, defaults, onDone }: { task?: Task; defaults?: Partial<Task>; onDone: () => void }) {
  const router = useRouter();
  const data = useAppData();
  const { today, nowMin } = useClock();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(task ?? defaults));
  const [tagText, setTagText] = useState(() => draftFrom(task ?? defaults).tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [depFilter, setDepFilter] = useState("");
  const isNew = !task;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const blockedIds = useMemo(() => (task ? dependentsOf(task.id, data.tasks) : new Set<string>()), [task, data.tasks]);
  const depCandidates = data.tasks.filter(
    (t) =>
      t.id !== task?.id &&
      !blockedIds.has(t.id) &&
      (t.status !== "done" || draft.dependsOn.includes(t.id)) &&
      t.title.toLowerCase().includes(depFilter.toLowerCase()),
  );

  const scheduled = task
    ? data.blocks.filter((b) => b.taskId === task.id && b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
    : [];
  const focusMinutes = task
    ? data.focusSessions.filter((s) => s.taskId === task.id).reduce((s, f) => s + f.focusedMinutes, 0)
    : 0;

  function save() {
    const title = draft.title.trim();
    if (!title) return setError("Give the task a title.");
    if (!Number.isFinite(draft.estimatedMinutes) || draft.estimatedMinutes < 5 || draft.estimatedMinutes > 720) {
      return setError("Estimated duration must be between 5 minutes and 12 hours.");
    }
    if (draft.dueTime && !draft.dueDate) return setError("Pick a due date for the due time.");
    const tags = [...new Set(tagText.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 12).map((t) => t.slice(0, 40));
    const values = { ...draft, title, tags };

    if (isNew) {
      createTasks([buildTask(values)]);
      toast.success("Task added");
    } else {
      const { status, ...rest } = values;
      updateTask(task.id, rest);
      if (status !== task.status) setTaskStatus(task.id, status);
      toast.success("Changes saved");
    }
    onDone();
  }

  function remove() {
    if (!task) return;
    const undo = deleteTask(task.id);
    onDone();
    toast("Task deleted", { description: task.title, action: undo ? { label: "Undo", onClick: undo } : undefined });
  }

  function toggleDone() {
    if (!task) return;
    const spawned = setTaskStatus(task.id, task.status === "done" ? "todo" : "done");
    if (task.status !== "done") {
      toast.success("Nice work. Task completed.", {
        description: spawned?.dueDate ? `Next one scheduled for ${relativeDayLabel(spawned.dueDate, today)}.` : undefined,
      });
    }
    onDone();
  }

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="font-display text-2xl font-normal">{isNew ? "New task" : "Task details"}</SheetTitle>
        <SheetDescription>
          {isNew
            ? "Capture it now; you can refine the details later."
            : `Created ${relativeDayLabel(isoToLocalDate(task.createdAt, data.profile.timezone), today).toLowerCase()}${
                task.completedAt ? ` · completed ${relativeDayLabel(isoToLocalDate(task.completedAt, data.profile.timezone), today).toLowerCase()}` : ""
              }`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {task && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={task.status === "done" ? "outline" : "default"} onClick={toggleDone}>
              {task.status === "done" ? <RotateCcw /> : <CheckCircle2 />}
              {task.status === "done" ? "Reopen" : "Mark complete"}
            </Button>
            {task.status !== "done" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onDone();
                  router.push(`/focus?task=${task.id}`);
                }}
              >
                <Timer /> Start focus
              </Button>
            )}
          </div>
        )}

        <Field label="Title" htmlFor="task-title" error={error}>
          <Input
            id="task-title"
            autoFocus={isNew}
            value={draft.title}
            maxLength={200}
            placeholder="e.g. Draft the project proposal"
            onChange={(e) => {
              set("title", e.target.value);
              setError(null);
            }}
          />
        </Field>

        <Field label="Notes" htmlFor="task-notes">
          <Textarea
            id="task-notes"
            value={draft.description}
            maxLength={4000}
            rows={3}
            placeholder="Context, links, acceptance criteria…"
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority" htmlFor="task-priority">
            <NativeSelect id="task-priority" value={draft.priority} onChange={(e) => set("priority", e.target.value as Task["priority"])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Category" htmlFor="task-category">
            <NativeSelect id="task-category" value={draft.category} onChange={(e) => set("category", e.target.value as Task["category"])}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!isNew && (
            <Field label="Status" htmlFor="task-status">
              <NativeSelect id="task-status" value={draft.status} onChange={(e) => set("status", e.target.value as Task["status"])}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </NativeSelect>
            </Field>
          )}
          <Field label="Best time" htmlFor="task-time-of-day">
            <NativeSelect
              id="task-time-of-day"
              value={draft.preferredTime}
              onChange={(e) => set("preferredTime", e.target.value as Task["preferredTime"])}
            >
              {TIMES_OF_DAY.map((t) => (
                <option key={t} value={t}>
                  {TIME_OF_DAY_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Estimated duration (minutes)" htmlFor="task-minutes">
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              id="task-minutes"
              type="number"
              min={5}
              max={720}
              step={5}
              className="w-24"
              value={draft.estimatedMinutes}
              onChange={(e) => set("estimatedMinutes", Number(e.target.value))}
            />
            {QUICK_DURATIONS.map((m) => (
              <Button
                key={m}
                type="button"
                size="xs"
                variant={draft.estimatedMinutes === m ? "secondary" : "ghost"}
                onClick={() => set("estimatedMinutes", m)}
              >
                {formatDuration(m)}
              </Button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" htmlFor="task-due">
            <Input
              id="task-due"
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(e) => set("dueDate", e.target.value || null)}
            />
          </Field>
          <Field label="Due time (optional)" htmlFor="task-due-time">
            <Input
              id="task-due-time"
              type="time"
              value={draft.dueTime ?? ""}
              disabled={!draft.dueDate}
              onChange={(e) => set("dueTime", e.target.value || null)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeat" htmlFor="task-repeat" hint={draft.recurrence !== "none" ? "A new task is created when you complete this one." : undefined}>
            <NativeSelect id="task-repeat" value={draft.recurrence} onChange={(e) => set("recurrence", e.target.value as Task["recurrence"])}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Goal" htmlFor="task-goal">
            <NativeSelect id="task-goal" value={draft.goalId ?? ""} onChange={(e) => set("goalId", e.target.value || null)}>
              <option value="">No goal</option>
              {data.goals
                .filter((g) => g.status === "active" || g.id === draft.goalId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Tags" htmlFor="task-tags" hint="Separate with commas.">
          <Input id="task-tags" value={tagText} placeholder="client, deep-work" onChange={(e) => setTagText(e.target.value)} />
        </Field>

        <Field label="Must happen after" hint="The planner will schedule this only after these are done or scheduled earlier.">
          <div className="rounded-lg border">
            {depCandidates.length + draft.dependsOn.length > 6 && (
              <Input
                aria-label="Filter tasks"
                placeholder="Filter tasks…"
                value={depFilter}
                onChange={(e) => setDepFilter(e.target.value)}
                className="rounded-b-none border-0 border-b"
              />
            )}
            <ul className="max-h-40 overflow-y-auto p-1">
              {depCandidates.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">No other open tasks.</li>}
              {depCandidates.map((t) => {
                const checked = draft.dependsOn.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          set("dependsOn", v ? [...draft.dependsOn, t.id] : draft.dependsOn.filter((d) => d !== t.id))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <PriorityBadge priority={t.priority} />
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </Field>

        {task && (scheduled.length > 0 || focusMinutes > 0) && (
          <div className="space-y-2 rounded-xl border bg-surface/60 p-3 text-xs text-muted-foreground">
            {scheduled.map((b) => (
              <p key={b.id} className="flex items-center gap-2">
                <Clock3 className="size-3.5" aria-hidden />
                Scheduled {relativeDayLabel(b.date, today).toLowerCase()} {formatClock(b.startMin)}–{formatClock(b.endMin)}
                {b.date === today && b.endMin < nowMin && " (passed)"}
              </p>
            ))}
            {focusMinutes > 0 && (
              <p className="flex items-center gap-2">
                <Timer className="size-3.5" aria-hidden /> {formatDuration(focusMinutes)} of focused work logged
              </p>
            )}
            {task.dependsOn.length > 0 && (
              <p className="flex items-center gap-2">
                <Link2 className="size-3.5" aria-hidden /> Depends on {task.dependsOn.length} task
                {task.dependsOn.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        )}
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t px-5 py-3">
        {task ? (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={remove}>
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit">{isNew ? "Add task" : "Save changes"}</Button>
        </div>
      </SheetFooter>
    </form>
  );
}
