import type { Priority, Profile, ScheduleBlock, Task, TimeOfDay } from "./types";
import { diffDays, formatClock, formatDuration, toMinutes, weekday, weekdayLong } from "./time";

/**
 * Deterministic daily scheduler.
 *
 * Walks the day chronologically from the first available minute. At every free
 * point it picks the most important task that is eligible right now (its
 * dependencies are finished or already scheduled earlier, its preferred time
 * window has started, and it fits before the next fixed commitment or its own
 * deadline). Long tasks may be split into chunks; breaks are inserted after
 * sustained work. Anything that does not fit is reported, never squeezed in.
 *
 * All time arithmetic lives here; the LLM is never trusted with it.
 */

export type PlanProfile = Pick<
  Profile,
  "workStart" | "workEnd" | "workDays" | "bufferMinutes" | "breakAfterMinutes" | "shortBreakMinutes"
>;

export interface PlanInput {
  date: string;
  /** Minutes since midnight when planning for today; null when planning a future day. */
  nowMin: number | null;
  profile: PlanProfile;
  tasks: Task[];
  /** Blocks on `date` the plan must respect: events, locked blocks, blocks already in the past. */
  fixedBlocks: ScheduleBlock[];
  newId?: () => string;
  /** Plan even if `date` is not one of the user's working days. */
  ignoreWorkDays?: boolean;
}

export interface UnscheduledTask {
  taskId: string;
  title: string;
  reason: string;
  /** Due on or before the planned date, so not fitting it is a real problem. */
  mustDo: boolean;
  remainingMinutes: number;
}

export interface PlanStats {
  isWorkDay: boolean;
  availableMinutes: number;
  plannedMinutes: number;
  mustDoMinutes: number;
  overloaded: boolean;
  overloadMinutes: number;
}

export interface PlanResult {
  blocks: ScheduleBlock[];
  unscheduled: UnscheduledTask[];
  /** Why each scheduled task was prioritized, keyed by task id. */
  reasons: Record<string, string[]>;
  stats: PlanStats;
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { low: 10, medium: 20, high: 30, urgent: 40 };

export const WINDOW_START: Record<TimeOfDay, number> = {
  any: 0,
  morning: 0,
  afternoon: 12 * 60,
  evening: 17 * 60,
};

const MIN_CHUNK = 25;
const SPLIT_THRESHOLD = 60;
const MIN_GAP = 10;

export function windowOf(min: number): Exclude<TimeOfDay, "any"> {
  if (min < WINDOW_START.afternoon) return "morning";
  if (min < WINDOW_START.evening) return "afternoon";
  return "evening";
}

export function isSplittable(task: Pick<Task, "estimatedMinutes">): boolean {
  return task.estimatedMinutes > SPLIT_THRESHOLD;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Importance score of a task for a given day, plus human-readable reasons. */
export function scoreTask(
  task: Task,
  date: string,
  dependents: number,
): { score: number; reasons: string[] } {
  let score = PRIORITY_WEIGHT[task.priority];
  const reasons: string[] = [];

  if (task.dueDate) {
    const d = diffDays(date, task.dueDate);
    if (d < 0) {
      score += 50;
      reasons.push(`Overdue by ${plural(-d, "day")}`);
    } else if (d === 0) {
      score += task.dueTime ? 45 : 35;
      reasons.push(task.dueTime ? `Due today at ${formatClock(toMinutes(task.dueTime))}` : "Due today");
    } else if (d === 1) {
      score += 20;
      reasons.push("Due tomorrow");
    } else if (d <= 3) {
      score += 10;
      reasons.push(`Due in ${d} days`);
    } else if (d <= 7) {
      score += 4;
    }
  }
  if (task.priority === "urgent") reasons.push("Urgent priority");
  else if (task.priority === "high") reasons.push("High priority");

  if (dependents > 0) {
    score += 4 * dependents;
    reasons.push(`Unblocks ${plural(dependents, "other task")}`);
  }
  if (task.status === "in_progress") {
    score += 5;
    reasons.push("Already in progress");
  }
  return { score, reasons };
}

export function countDependents(tasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === "done") continue;
    for (const dep of t.dependsOn) counts.set(dep, (counts.get(dep) ?? 0) + 1);
  }
  return counts;
}

/** Free intervals inside [from, to) not covered by any block. */
export function freeIntervals(
  blocks: Pick<ScheduleBlock, "startMin" | "endMin">[],
  from: number,
  to: number,
): Array<[number, number]> {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const out: Array<[number, number]> = [];
  let cursor = from;
  for (const b of sorted) {
    if (b.endMin <= cursor) continue;
    if (b.startMin >= to) break;
    if (b.startMin > cursor) out.push([cursor, Math.min(b.startMin, to)]);
    cursor = Math.max(cursor, b.endMin);
    if (cursor >= to) break;
  }
  if (cursor < to) out.push([cursor, to]);
  return out;
}

interface Item {
  task: Task;
  remaining: number;
  total: number;
  lastEnd: number | null;
  score: number;
  reasons: string[];
  missedDeadline: boolean;
}

let fallbackCounter = 0;
function defaultId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  fallbackCounter += 1;
  return `blk-${Date.now()}-${fallbackCounter}`;
}

export function planDay(input: PlanInput): PlanResult {
  const { date, profile } = input;
  const newId = input.newId ?? defaultId;
  const dayStart = toMinutes(profile.workStart);
  const dayEnd = toMinutes(profile.workEnd);
  const isWorkDay = input.ignoreWorkDays || profile.workDays.includes(weekday(date));

  let start = dayStart;
  if (input.nowMin !== null) start = Math.max(start, Math.ceil(input.nowMin / 5) * 5);

  const fixed = input.fixedBlocks
    .filter((b) => b.date === date)
    .sort((a, b) => a.startMin - b.startMin);

  const free = isWorkDay ? freeIntervals(fixed, start, dayEnd) : [];
  const availableMinutes = free.reduce((s, [a, b]) => s + (b - a), 0);

  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  const dependents = countDependents(input.tasks);

  // Minutes of each task already covered by fixed (manual/locked/past) blocks.
  const covered = new Map<string, number>();
  const fixedEnd = new Map<string, number>();
  for (const b of fixed) {
    if (b.kind !== "task" || !b.taskId) continue;
    covered.set(b.taskId, (covered.get(b.taskId) ?? 0) + (b.endMin - b.startMin));
    fixedEnd.set(b.taskId, Math.max(fixedEnd.get(b.taskId) ?? 0, b.endMin));
  }

  const items: Item[] = [];
  for (const task of input.tasks) {
    if (task.status === "done") continue;
    const remaining = Math.max(0, task.estimatedMinutes - (covered.get(task.id) ?? 0));
    if (remaining === 0) continue;
    const { score, reasons } = scoreTask(task, date, dependents.get(task.id) ?? 0);
    items.push({ task, remaining, total: remaining, lastEnd: null, score, reasons, missedDeadline: false });
  }
  const itemById = new Map(items.map((i) => [i.task.id, i]));

  const depsReadyAt = (item: Item, cursor: number): boolean =>
    item.task.dependsOn.every((depId) => {
      const dep = taskById.get(depId);
      if (!dep || dep.status === "done") return true;
      const depItem = itemById.get(depId);
      if (depItem) return depItem.remaining === 0 && depItem.lastEnd !== null && depItem.lastEnd <= cursor;
      const end = fixedEnd.get(depId);
      return end !== undefined && end <= cursor;
    });

  /**
   * Latest minute the task may end, if it has a same-day deadline that was still
   * ahead when planning started. Deadlines already passed are treated as overdue.
   */
  const deadlineCap = (item: Item): number | null => {
    const t = item.task;
    if (t.dueDate !== date || !t.dueTime) return null;
    const due = toMinutes(t.dueTime);
    return due > start ? due : null;
  };

  /** Could the rest of this task still be done in free time before `cap`? */
  const fitsBefore = (item: Item, cursor: number, cap: number): boolean => {
    const segs = free
      .map(([a, b]) => [Math.max(a, cursor), Math.min(b, cap)] as const)
      .filter(([a, b]) => b > a);
    if (!isSplittable(item.task)) return segs.some(([a, b]) => b - a >= item.remaining);
    return segs.reduce((s, [a, b]) => s + (b - a), 0) >= item.remaining;
  };

  const blocks: ScheduleBlock[] = [];
  let cursor = start;
  let run = 0;
  let guard = 0;

  const hasPending = () => items.some((i) => i.remaining > 0 && !i.missedDeadline);

  while (isWorkDay && cursor < dayEnd && hasPending() && guard++ < 5000) {
    const inside = fixed.find((b) => b.startMin <= cursor && cursor < b.endMin);
    if (inside) {
      run = inside.kind === "break" ? 0 : run + (inside.endMin - Math.max(inside.startMin, cursor));
      cursor = inside.endMin;
      continue;
    }
    const nextFixed = fixed.find((b) => b.startMin > cursor);
    const gapEnd = Math.min(dayEnd, nextFixed ? nextFixed.startMin : dayEnd);
    const avail = gapEnd - cursor;
    if (avail < MIN_GAP) {
      cursor = gapEnd;
      if (avail > 0) run = Math.max(0, run - avail);
      continue;
    }

    if (run >= profile.breakAfterMinutes) {
      const len = Math.min(profile.shortBreakMinutes, avail);
      blocks.push({
        id: newId(), date, startMin: cursor, endMin: cursor + len, kind: "break",
        taskId: null, title: "Break", locked: false, source: "planner",
      });
      cursor += len;
      run = 0;
      continue;
    }

    for (const i of items) {
      const cap = deadlineCap(i);
      if (i.remaining > 0 && cap !== null && !i.missedDeadline && !fitsBefore(i, cursor, cap)) {
        i.missedDeadline = true;
      }
    }

    const window = windowOf(cursor);
    const candidates = items
      .filter(
        (i) =>
          i.remaining > 0 &&
          !i.missedDeadline &&
          cursor >= WINDOW_START[i.task.preferredTime] &&
          depsReadyAt(i, cursor),
      )
      .map((i) => ({ i, s: i.score + (i.task.preferredTime === window ? 8 : 0) }))
      .sort(
        (a, b) =>
          b.s - a.s ||
          (a.i.task.dueDate ?? "9999").localeCompare(b.i.task.dueDate ?? "9999") ||
          a.i.task.createdAt.localeCompare(b.i.task.createdAt),
      )
      .map((c) => c.i);

    let chosen: { item: Item; len: number } | null = null;
    for (const item of candidates) {
      const cap = deadlineCap(item);
      const space = (cap === null ? gapEnd : Math.min(gapEnd, cap)) - cursor;
      if (!isSplittable(item.task) || item.remaining <= MIN_CHUNK) {
        if (item.remaining <= space) chosen = { item, len: item.remaining };
      } else {
        const maxLen = Math.max(MIN_CHUNK, profile.breakAfterMinutes - run);
        let len = Math.min(item.remaining, space, maxLen);
        // Avoid leaving a sliver that is not worth its own block.
        const leftover = item.remaining - len;
        if (leftover > 0 && leftover < 15) len = item.remaining - 15;
        if (len >= MIN_CHUNK) chosen = { item, len };
      }
      if (chosen) break;
    }

    if (!chosen) {
      if (candidates.length === 0) {
        const nextWindow = items
          .filter((i) => i.remaining > 0 && WINDOW_START[i.task.preferredTime] > cursor)
          .map((i) => WINDOW_START[i.task.preferredTime])
          .sort((a, b) => a - b)[0];
        const jumpTo = nextWindow !== undefined && nextWindow < gapEnd ? nextWindow : gapEnd;
        if (jumpTo - cursor >= profile.shortBreakMinutes) run = 0;
        cursor = jumpTo;
      } else {
        if (gapEnd - cursor >= profile.shortBreakMinutes) run = 0;
        cursor = gapEnd;
      }
      continue;
    }

    const { item, len } = chosen;
    blocks.push({
      id: newId(), date, startMin: cursor, endMin: cursor + len, kind: "task",
      taskId: item.task.id, title: item.task.title, locked: false, source: "planner",
    });
    item.remaining -= len;
    item.lastEnd = cursor + len;
    cursor += len;
    run += len;
    if (profile.bufferMinutes > 0 && cursor + profile.bufferMinutes <= gapEnd && hasPending()) {
      cursor += profile.bufferMinutes;
    }
  }

  // Drop a trailing break: there is nothing after it to rest for.
  while (blocks.length && blocks[blocks.length - 1].kind === "break") blocks.pop();

  const unscheduled: UnscheduledTask[] = [];
  let mustDoMinutes = 0;
  let overloadMinutes = 0;
  for (const item of items) {
    const t = item.task;
    const mustDo = t.dueDate !== null && diffDays(date, t.dueDate) <= 0;
    if (mustDo) mustDoMinutes += item.total;
    if (item.remaining === 0) continue;
    if (mustDo) overloadMinutes += item.remaining;
    unscheduled.push({
      taskId: t.id,
      title: t.title,
      mustDo,
      remainingMinutes: item.remaining,
      reason: explainUnscheduled(item, { isWorkDay, date, dayEnd, availableMinutes, taskById, itemById }),
    });
  }
  unscheduled.sort((a, b) => Number(b.mustDo) - Number(a.mustDo) || b.remainingMinutes - a.remainingMinutes);

  const reasons: Record<string, string[]> = {};
  for (const b of blocks) {
    if (b.taskId && !reasons[b.taskId]) {
      const item = itemById.get(b.taskId);
      if (item) reasons[b.taskId] = item.reasons;
    }
  }

  return {
    blocks,
    unscheduled,
    reasons,
    stats: {
      isWorkDay,
      availableMinutes,
      plannedMinutes: blocks.filter((b) => b.kind === "task").reduce((s, b) => s + b.endMin - b.startMin, 0),
      mustDoMinutes,
      overloaded: overloadMinutes > 0,
      overloadMinutes,
    },
  };
}

function explainUnscheduled(
  item: Item,
  ctx: {
    isWorkDay: boolean;
    date: string;
    dayEnd: number;
    availableMinutes: number;
    taskById: Map<string, Task>;
    itemById: Map<string, Item>;
  },
): string {
  const t = item.task;
  if (!ctx.isWorkDay) return `${weekdayLong(ctx.date)} isn't one of your working days.`;

  const blocker = t.dependsOn
    .map((id) => ctx.taskById.get(id))
    .find((dep) => dep && dep.status !== "done" && (ctx.itemById.get(dep.id)?.remaining ?? 0) > 0);
  if (blocker) return `Waiting on “${blocker.title}”, which doesn't fit today.`;

  if (t.preferredTime !== "any" && WINDOW_START[t.preferredTime] >= ctx.dayEnd) {
    return `You prefer the ${t.preferredTime} for this, but your availability ends at ${formatClock(ctx.dayEnd)}.`;
  }
  if (item.missedDeadline && t.dueTime) {
    return `Can't be finished before its ${formatClock(toMinutes(t.dueTime))} deadline with the time left.`;
  }
  if (item.remaining < item.total) {
    return `Only ${formatDuration(item.total - item.remaining)} of ${formatDuration(item.total)} fits today.`;
  }
  if (ctx.availableMinutes === 0) return "No free time left in your working hours.";
  return "Not enough free time left today.";
}

/* ------------------------------------------------------------------------ */
/* Conflict detection and manual edits                                       */
/* ------------------------------------------------------------------------ */

export function overlaps(
  a: Pick<ScheduleBlock, "date" | "startMin" | "endMin">,
  b: Pick<ScheduleBlock, "date" | "startMin" | "endMin">,
): boolean {
  return a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin;
}

/** All pairs of overlapping blocks (each pair reported once). */
export function findConflicts(blocks: ScheduleBlock[]): Array<[ScheduleBlock, ScheduleBlock]> {
  const out: Array<[ScheduleBlock, ScheduleBlock]> = [];
  const sorted = [...blocks].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].date !== sorted[i].date || sorted[j].startMin >= sorted[i].endMin) break;
      out.push([sorted[i], sorted[j]]);
    }
  }
  return out;
}

/**
 * Validate placing `block` among `others`. Task blocks must sit inside working
 * hours; events (commitments the user already has) may be anywhere.
 * Returns an error message, or null if the placement is fine.
 */
export function validatePlacement(
  block: ScheduleBlock,
  others: ScheduleBlock[],
  profile: Pick<Profile, "workStart" | "workEnd">,
): string | null {
  if (block.endMin <= block.startMin) return "The block must end after it starts.";
  if (block.startMin < 0 || block.endMin > 1440) return "The block must stay within the day.";
  if (block.kind === "task") {
    const s = toMinutes(profile.workStart);
    const e = toMinutes(profile.workEnd);
    if (block.startMin < s || block.endMin > e) {
      return `Tasks can only be scheduled within your working hours (${formatClock(s)}–${formatClock(e)}).`;
    }
  }
  const clash = others.find((o) => o.id !== block.id && overlaps(o, block));
  if (clash) {
    return `Overlaps “${clash.title}” (${formatClock(clash.startMin)}–${formatClock(clash.endMin)}).`;
  }
  return null;
}

/**
 * Swap two blocks on the same day, keeping the gap between them. Returns the
 * two updated blocks or an error if the swap would collide with something else.
 */
export function swapBlocks(
  a: ScheduleBlock,
  b: ScheduleBlock,
  all: ScheduleBlock[],
): { ok: true; blocks: [ScheduleBlock, ScheduleBlock] } | { ok: false; error: string } {
  if (a.date !== b.date) return { ok: false, error: "Blocks are on different days." };
  if (a.locked || b.locked) return { ok: false, error: "Unlock the block before moving it." };
  const [early, late] = a.startMin <= b.startMin ? [a, b] : [b, a];
  const gap = late.startMin - early.endMin;
  if (gap < 0) return { ok: false, error: "These blocks overlap; fix the conflict first." };
  const lateDur = late.endMin - late.startMin;
  const earlyDur = early.endMin - early.startMin;
  const newLate = { ...late, startMin: early.startMin, endMin: early.startMin + lateDur };
  const newEarly = { ...early, startMin: newLate.endMin + gap, endMin: newLate.endMin + gap + earlyDur };
  const others = all.filter((x) => x.id !== a.id && x.id !== b.id);
  for (const nb of [newLate, newEarly]) {
    const clash = others.find((o) => overlaps(o, nb));
    if (clash) return { ok: false, error: `Swapping would overlap “${clash.title}”.` };
  }
  return { ok: true, blocks: [newLate, newEarly] };
}

/** Earliest free start (on a 5-minute grid) for a block of `duration` on a day. */
export function findFreeSlot(
  duration: number,
  blocks: ScheduleBlock[],
  date: string,
  profile: Pick<Profile, "workStart" | "workEnd">,
  fromMin = 0,
): number | null {
  const s = Math.max(toMinutes(profile.workStart), Math.ceil(fromMin / 5) * 5);
  const e = toMinutes(profile.workEnd);
  const sameDay = blocks.filter((b) => b.date === date);
  for (const [a, b] of freeIntervals(sameDay, s, e)) {
    if (b - a >= duration) return a;
  }
  return null;
}
