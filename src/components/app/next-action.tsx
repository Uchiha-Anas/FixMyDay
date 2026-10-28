"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { CheckCircle2, Compass, Play, Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryTag, DueChip, EmptyState, PriorityBadge } from "./primitives";
import { useAppData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useClock } from "@/hooks/use-clock";
import { recommendNext } from "@/lib/recommend";
import { setTaskStatus } from "@/lib/app-actions";
import { formatDuration } from "@/lib/time";

export function useRecommendations() {
  const data = useAppData();
  const { today, nowMin } = useClock();
  return useMemo(
    () => recommendNext({ tasks: data.tasks, blocks: data.blocks, today, nowMin, profile: data.profile }),
    [data.tasks, data.blocks, data.profile, today, nowMin],
  );
}

export function NextActionCard({ className, onAction }: { className?: string; onAction?: () => void }) {
  const router = useRouter();
  const recs = useRecommendations();
  const { today, nowMin } = useClock();
  const openNewTask = useUI((s) => s.openNewTask);
  const [skipped, setSkipped] = useState<string[]>([]);

  const visible = recs.filter((r) => !skipped.includes(r.task.id));
  const rec = visible[0] ?? recs[0];

  if (!rec) {
    return (
      <EmptyState
        className={className}
        icon={Compass}
        title="Nothing waiting on you"
        description="All open tasks are done or blocked. Add something new, or enjoy the free time."
        action={
          <Button size="sm" variant="outline" onClick={() => openNewTask()}>
            Add a task
          </Button>
        }
      />
    );
  }

  const { task, reasons } = rec;
  const alternatives = recs.length - 1;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={task.priority} />
          <CategoryTag category={task.category} />
          <span className="text-xs text-muted-foreground">{formatDuration(task.estimatedMinutes)}</span>
          <DueChip task={task} today={today} nowMin={nowMin} />
        </div>
        <p className="mt-2 text-lg leading-snug font-medium text-balance">{task.title}</p>
        {task.description && !task.description.startsWith("From your brain dump") && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
        )}
      </div>
      <ul className="space-y-1.5" aria-label="Why this task">
        {reasons.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            if (task.status === "todo") setTaskStatus(task.id, "in_progress");
            onAction?.();
            router.push(`/focus?task=${task.id}`);
          }}
        >
          <Play /> Start now
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setTaskStatus(task.id, "done");
            toast.success("Done. On to the next one.", { description: task.title });
          }}
        >
          <CheckCircle2 /> Complete
        </Button>
        {alternatives > 0 && (
          <Button
            variant="ghost"
            onClick={() => setSkipped((s) => (visible.length <= 1 ? [] : [...s, task.id]))}
            aria-label="Suggest a different task"
          >
            <Shuffle /> Something else
          </Button>
        )}
      </div>
    </div>
  );
}

export function NextActionDialog() {
  const open = useUI((s) => s.nextActionOpen);
  const setOpen = useUI((s) => s.setNextActionOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-normal">
            <Compass className="size-5 text-primary" /> What should I do now?
          </DialogTitle>
          <DialogDescription>Picked from your saved tasks and today&apos;s schedule.</DialogDescription>
        </DialogHeader>
        <NextActionCard onAction={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
