"use client";

import { useMemo } from "react";
import { cn } from "cn";
import { AlertTriangle, Check, Coffee, Flag, Lock } from "lucide-react";
import type { ScheduleBlock, Task } from "@/lib/types";
import { formatClock, formatDuration, toMinutes } from "@/lib/time";
import { overlaps } from "@/lib/scheduler";

export type BlockStatus = "done" | "missed" | "current" | "upcoming" | "event" | "break";

export function blockStatus(block: ScheduleBlock, task: Task | undefined, isToday: boolean, isPast: boolean, nowMin: number): BlockStatus {
  if (block.kind === "event") return "event";
  if (block.kind === "break") return "break";
  if (task?.status === "done") return "done";
  if (isPast || (isToday && block.endMin <= nowMin)) return "missed";
  if (isToday && block.startMin <= nowMin && nowMin < block.endMin) return "current";
  return "upcoming";
}

const STATUS_STYLE: Record<BlockStatus, string> = {
  done: "border-success/30 bg-success/10 text-muted-foreground",
  missed: "border-destructive/35 bg-destructive/8",
  current: "border-primary bg-primary/18 ring-2 ring-primary/40",
  upcoming: "border-primary/30 bg-primary/10",
  event: "border-info/30 bg-info/10",
  break: "stripes border-dashed bg-muted/30 text-muted-foreground",
};

export const STATUS_LABEL: Record<BlockStatus, string> = {
  done: "Completed",
  missed: "Overdue",
  current: "Now",
  upcoming: "Upcoming",
  event: "Event",
  break: "Break",
};

interface Positioned {
  block: ScheduleBlock;
  col: number;
  cols: number;
  conflict: boolean;
}

/** Assign side-by-side columns to overlapping blocks so conflicts stay visible. */
function layout(blocks: ScheduleBlock[]): Positioned[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    for (const p of cluster) p.cols = cols;
    out.push(...cluster);
    cluster = [];
  };
  for (const block of sorted) {
    if (block.startMin >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((p) => overlaps(p.block, block)).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col++;
    const conflict = cluster.some((p) => overlaps(p.block, block) && p.block.kind !== "break" && block.kind !== "break");
    if (conflict) for (const p of cluster) if (overlaps(p.block, block)) p.conflict = true;
    cluster.push({ block, col, cols: 1, conflict });
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  if (cluster.length) flush();
  return out;
}

export function DayTimeline({
  date,
  blocks,
  tasks,
  today,
  nowMin,
  startMin,
  endMin,
  pxPerMin = 1.1,
  workStart,
  workEnd,
  onBlockClick,
  className,
}: {
  date: string;
  blocks: ScheduleBlock[];
  tasks: Task[];
  today: string;
  nowMin: number;
  startMin: number;
  endMin: number;
  pxPerMin?: number;
  workStart?: number;
  workEnd?: number;
  onBlockClick?: (block: ScheduleBlock) => void;
  className?: string;
}) {
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const dayBlocks = blocks.filter((b) => b.date === date && b.endMin > startMin && b.startMin < endMin);
  const positioned = useMemo(() => layout(dayBlocks), [dayBlocks]);
  const deadlines = tasks.filter((t) => t.dueDate === date && t.dueTime && t.status !== "done");
  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hours.push(m);
  const height = (endMin - startMin) * pxPerMin;
  const y = (m: number) => (Math.min(Math.max(m, startMin), endMin) - startMin) * pxPerMin;
  const isToday = date === today;
  const isPast = date < today;

  return (
    <div className={cn("relative", className)} style={{ height }} role="list" aria-label={`Schedule for ${date}`}>
      {workStart !== undefined && workEnd !== undefined && (
        <div
          className="absolute right-0 left-14 rounded-md bg-primary/[0.03]"
          style={{ top: y(workStart), height: y(workEnd) - y(workStart) }}
          aria-hidden
        />
      )}
      {hours.map((m) => (
        <div key={m} className="absolute right-0 left-0 flex items-start" style={{ top: y(m) }} aria-hidden>
          <span className="w-12 -translate-y-2 pr-2 text-right text-[11px] text-muted-foreground tabular-nums">{formatClock(m)}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ))}

      {deadlines.map((t) => (
        <div
          key={`dl-${t.id}`}
          className="absolute right-0 left-14 z-10 flex items-center gap-1"
          style={{ top: y(toMinutes(t.dueTime!)) - 1 }}
        >
          <span className="h-px flex-1 border-t border-dashed border-warning/70" />
          <span className="flex items-center gap-1 rounded bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
            <Flag className="size-3" aria-hidden /> Due: {t.title.length > 28 ? `${t.title.slice(0, 28)}…` : t.title}
          </span>
        </div>
      ))}

      <div className="absolute top-0 right-0 bottom-0 left-14">
        {positioned.map(({ block, col, cols, conflict }) => {
          const task = block.taskId ? taskById.get(block.taskId) : undefined;
          const status = blockStatus(block, task, isToday, isPast, nowMin);
          const top = y(block.startMin);
          const h = Math.max(18, y(block.endMin) - top - 2);
          const short = h < 40;
          const Comp = onBlockClick ? "button" : "div";
          return (
            <Comp
              key={block.id}
              type={onBlockClick ? "button" : undefined}
              role="listitem"
              onClick={onBlockClick ? () => onBlockClick(block) : undefined}
              className={cn(
                "absolute overflow-hidden rounded-lg border px-2 text-left text-xs transition-[filter] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                onBlockClick && "cursor-pointer hover:brightness-110",
                STATUS_STYLE[status],
                conflict && "border-destructive ring-1 ring-destructive/60",
                short ? "flex items-center gap-1.5 py-0" : "py-1.5",
              )}
              style={{
                top,
                height: h,
                left: `calc(${(col / cols) * 100}% + 2px)`,
                width: `calc(${100 / cols}% - 4px)`,
              }}
              aria-label={`${block.title}, ${formatClock(block.startMin)} to ${formatClock(block.endMin)}, ${STATUS_LABEL[status]}${conflict ? ", conflicts with another block" : ""}`}
            >
              <span className={cn("flex min-w-0 items-center gap-1 font-medium", status === "done" && "line-through")}>
                {status === "done" && <Check className="size-3 shrink-0 text-success" aria-hidden />}
                {status === "break" && <Coffee className="size-3 shrink-0" aria-hidden />}
                {block.locked && block.kind === "task" && <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
                {conflict && <AlertTriangle className="size-3 shrink-0 text-destructive" aria-hidden />}
                <span className="truncate">{block.title}</span>
              </span>
              <span className={cn("text-[11px] text-muted-foreground tabular-nums", short && "shrink-0")}>
                {formatClock(block.startMin)}–{formatClock(block.endMin)}
                {!short && status === "missed" && <span className="ml-1 text-destructive">· not done</span>}
              </span>
            </Comp>
          );
        })}
      </div>

      {isToday && nowMin >= startMin && nowMin <= endMin && (
        <div className="pointer-events-none absolute right-0 left-12 z-20 flex items-center" style={{ top: y(nowMin) }} aria-label={`Now, ${formatClock(nowMin)}`}>
          <span className="size-2 -translate-x-1 rounded-full bg-primary" />
          <span className="h-0.5 flex-1 bg-primary/80" />
        </div>
      )}
    </div>
  );
}

export function AgendaList({
  blocks,
  tasks,
  nowMin,
  onBlockClick,
}: {
  blocks: ScheduleBlock[];
  tasks: Task[];
  nowMin: number;
  onBlockClick?: (block: ScheduleBlock) => void;
}) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  return (
    <ol className="relative space-y-1">
      {sorted.map((b) => {
        const task = b.taskId ? taskById.get(b.taskId) : undefined;
        const status = blockStatus(b, task, true, false, nowMin);
        const Comp = onBlockClick && b.taskId ? "button" : "div";
        return (
          <li key={b.id}>
            <Comp
              type={Comp === "button" ? "button" : undefined}
              onClick={Comp === "button" ? () => onBlockClick?.(b) : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                Comp === "button" && "hover:bg-muted/50",
                status === "current" && "bg-primary/10",
              )}
            >
              <span className="w-[4.5rem] shrink-0 text-xs text-muted-foreground tabular-nums">{formatClock(b.startMin)}</span>
              <span
                className={cn(
                  "h-8 w-1 shrink-0 rounded-full",
                  status === "done" && "bg-success",
                  status === "missed" && "bg-destructive",
                  status === "current" && "bg-primary",
                  status === "upcoming" && "bg-primary/40",
                  status === "event" && "bg-info",
                  status === "break" && "bg-muted-foreground/30",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", status === "done" && "text-muted-foreground line-through", status === "break" && "text-muted-foreground")}>
                  {b.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(b.endMin - b.startMin)} · {STATUS_LABEL[status]}
                </span>
              </span>
            </Comp>
          </li>
        );
      })}
    </ol>
  );
}
