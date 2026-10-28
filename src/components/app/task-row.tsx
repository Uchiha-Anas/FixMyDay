"use client";

import { cn } from "cn";
import { toast } from "sonner";
import { Clock3, Link2, Repeat, Target } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryTag, DueChip, PriorityBadge } from "./primitives";
import { setTaskStatus } from "@/lib/app-actions";
import { useUI } from "@/lib/ui-store";
import { formatDuration, relativeDayLabel } from "@/lib/time";
import type { Task } from "@/lib/types";

export function TaskRow({
  task,
  today,
  nowMin,
  blocked,
  goalTitle,
  dense = false,
}: {
  task: Task;
  today: string;
  nowMin: number;
  blocked?: boolean;
  goalTitle?: string;
  dense?: boolean;
}) {
  const openTask = useUI((s) => s.openTask);
  const done = task.status === "done";

  function toggle(checked: boolean) {
    const spawned = setTaskStatus(task.id, checked ? "done" : "todo");
    if (checked) {
      toast.success("Task completed", {
        description: spawned?.dueDate ? `Repeats: next one due ${relativeDayLabel(spawned.dueDate, today).toLowerCase()}.` : task.title,
        action: { label: "Undo", onClick: () => setTaskStatus(task.id, "todo") },
      });
    }
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl px-3 transition-colors hover:bg-muted/40",
        dense ? "py-2" : "py-2.5",
      )}
    >
      <Checkbox
        className="mt-0.5 size-[18px] rounded-full"
        checked={done}
        onCheckedChange={(v) => toggle(!!v)}
        aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
      />
      <button
        type="button"
        className="min-w-0 flex-1 text-left outline-none focus-visible:underline"
        onClick={() => openTask(task.id)}
      >
        <span className={cn("block truncate text-sm", done && "text-muted-foreground line-through")}>{task.title}</span>
        {!dense || !done ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {!done && <PriorityBadge priority={task.priority} />}
            <CategoryTag category={task.category} />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden /> {formatDuration(task.estimatedMinutes)}
            </span>
            <DueChip task={task} today={today} nowMin={nowMin} />
            {task.status === "in_progress" && <span className="text-xs text-primary">In progress</span>}
            {blocked && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="size-3.5" aria-hidden /> Waiting on another task
              </span>
            )}
            {task.recurrence !== "none" && <Repeat className="size-3.5 text-muted-foreground" aria-label="Repeats" />}
            {goalTitle && !dense && (
              <span className="inline-flex max-w-48 items-center gap-1 truncate text-xs text-muted-foreground">
                <Target className="size-3.5 shrink-0" aria-hidden /> {goalTitle}
              </span>
            )}
          </span>
        ) : null}
      </button>
    </div>
  );
}
