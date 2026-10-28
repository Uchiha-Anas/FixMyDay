import type { Profile, ScheduleBlock, Task } from "./types";
import { diffDays, formatClock, formatDuration, minutesUntilDue, toMinutes } from "./time";
import { PRIORITY_WEIGHT, countDependents } from "./scheduler";

export interface RecommendInput {
  tasks: Task[];
  blocks: ScheduleBlock[];
  today: string;
  nowMin: number;
  profile: Pick<Profile, "workStart" | "workEnd">;
}

export interface Recommendation {
  task: Task;
  score: number;
  reasons: string[];
  /** Today's plan block for this task that is current or next, if any. */
  block: ScheduleBlock | null;
}

/**
 * Rank open, unblocked tasks by what makes sense to do right now. Purely
 * derived from saved tasks and today's schedule; no randomness, no LLM.
 */
export function recommendNext(input: RecommendInput): Recommendation[] {
  const { tasks, today, nowMin, profile } = input;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependents = countDependents(tasks);
  const todaysBlocks = input.blocks
    .filter((b) => b.date === today && b.kind === "task" && b.taskId)
    .sort((a, b) => a.startMin - b.startMin);
  const workEnd = toMinutes(profile.workEnd);
  const remainingWork = Math.max(0, workEnd - Math.max(nowMin, toMinutes(profile.workStart)));

  const out: Recommendation[] = [];
  for (const task of tasks) {
    if (task.status === "done") continue;
    const blocked = task.dependsOn.some((id) => {
      const dep = byId.get(id);
      return dep !== undefined && dep.status !== "done";
    });
    if (blocked) continue;

    const scored: Array<[number, string]> = [];
    let score = PRIORITY_WEIGHT[task.priority];
    if (task.priority === "urgent") scored.push([30, "Marked urgent"]);
    else if (task.priority === "high") scored.push([20, "High priority"]);

    if (task.dueDate) {
      const minutesLeft = minutesUntilDue(task.dueDate, task.dueTime, today, nowMin);
      const days = diffDays(today, task.dueDate);
      if (minutesLeft < 0) {
        score += 60;
        scored.push([60, "Overdue"]);
      } else if (task.dueDate === today) {
        score += 35;
        scored.push([35, task.dueTime ? `Due today at ${formatClock(toMinutes(task.dueTime))}` : "Due today"]);
        const slack = minutesLeft - task.estimatedMinutes;
        if (slack < 60) {
          score += 25;
          scored.push([
            50,
            slack <= 0
              ? `Needs ${formatDuration(task.estimatedMinutes)} but only ${formatDuration(minutesLeft)} remain`
              : `Only ${formatDuration(slack)} of slack before the deadline`,
          ]);
        }
      } else if (days <= 1) {
        score += 18;
        scored.push([18, "Due tomorrow"]);
      } else if (days <= 3) {
        score += 8;
        scored.push([8, `Due in ${days} days`]);
      }
    }

    const mine = todaysBlocks.filter((b) => b.taskId === task.id);
    const current = mine.find((b) => b.startMin <= nowMin && nowMin < b.endMin) ?? null;
    const upcoming = mine.find((b) => b.startMin > nowMin) ?? null;
    const missed = mine.find((b) => b.endMin <= nowMin) ?? null;
    if (current) {
      score += 45;
      scored.push([45, `Scheduled right now (until ${formatClock(current.endMin)})`]);
    } else if (upcoming && upcoming.startMin - nowMin <= 30) {
      score += 15;
      scored.push([15, `Planned to start at ${formatClock(upcoming.startMin)}`]);
    } else if (missed && !upcoming) {
      score += 10;
      scored.push([10, `Was planned for ${formatClock(missed.startMin)} and is still open`]);
    }

    if (task.status === "in_progress") {
      score += 12;
      scored.push([12, "You've already started it"]);
    }
    const deps = dependents.get(task.id) ?? 0;
    if (deps > 0) {
      score += 5 * deps;
      scored.push([5 * deps, `Unblocks ${deps} other task${deps === 1 ? "" : "s"}`]);
    }
    if (remainingWork > 0 && task.estimatedMinutes > remainingWork && !current) {
      score -= 15;
    } else if (task.estimatedMinutes <= 15) {
      score += 4;
      scored.push([4, `Quick win (${formatDuration(task.estimatedMinutes)})`]);
    }

    const reasons = scored
      .sort((a, b) => b[0] - a[0])
      .slice(0, 3)
      .map(([, r]) => r);
    if (reasons.length === 0) reasons.push(`Fits in ${formatDuration(task.estimatedMinutes)}`);

    out.push({ task, score, reasons, block: current ?? upcoming });
  }

  return out.sort(
    (a, b) =>
      b.score - a.score ||
      (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999") ||
      a.task.estimatedMinutes - b.task.estimatedMinutes,
  );
}
