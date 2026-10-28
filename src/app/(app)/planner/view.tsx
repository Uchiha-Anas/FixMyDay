"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  Coffee,
  Eraser,
  Info,
  Lock,
  LockOpen,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel, PanelHeader, PriorityBadge, StatTile } from "@/components/app/primitives";
import { DayTimeline, blockStatus, STATUS_LABEL } from "@/components/app/timeline";
import { BlockEditorDialog, type BlockDraft } from "@/components/app/block-editor";
import { useAppData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useClock } from "@/hooks/use-clock";
import { applyPlan, deleteBlock, upsertBlock, upsertBlocks } from "@/lib/app-actions";
import { findConflicts, findFreeSlot, freeIntervals, planDay, swapBlocks, type PlanResult } from "@/lib/scheduler";
import { addDays, formatClock, formatDuration, formatLongDate, relativeDayLabel, toMinutes, weekday } from "@/lib/time";
import type { ScheduleBlock, Task } from "@/lib/types";

type Explanation = Pick<PlanResult, "reasons" | "unscheduled"> & { generatedAt: string };
const EXPLAIN_KEY = "fixmyday.planner.explanations";

function loadExplanations(): Record<string, Explanation> {
  try {
    return JSON.parse(window.sessionStorage.getItem(EXPLAIN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function PlannerPage() {
  return (
    <Suspense>
      <Planner />
    </Suspense>
  );
}

function Planner() {
  const router = useRouter();
  const params = useSearchParams();
  const data = useAppData();
  const { today, nowMin } = useClock();
  const openTask = useUI((s) => s.openTask);
  const [date, setDate] = useState(today);
  const [editor, setEditor] = useState<BlockDraft | null>(null);
  const [explanations, setExplanations] = useState<Record<string, Explanation>>(loadExplanations);
  const autoRan = useRef(false);


  const isToday = date === today;
  const isPast = date < today;
  const profile = data.profile;
  const workStart = toMinutes(profile.workStart);
  const workEnd = toMinutes(profile.workEnd);
  const isWorkDay = profile.workDays.includes(weekday(date));

  const dayBlocks = useMemo(
    () => data.blocks.filter((b) => b.date === date).sort((a, b) => a.startMin - b.startMin),
    [data.blocks, date],
  );
  const taskById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);

  /** Tasks already planned on another upcoming day are left alone. */
  const plannedElsewhere = useMemo(() => {
    const ids = new Set<string>();
    for (const b of data.blocks) {
      if (!b.taskId || b.date === date) continue;
      if (b.date > today || (b.date === today && b.endMin > nowMin)) ids.add(b.taskId);
    }
    return ids;
  }, [data.blocks, date, today, nowMin]);

  function generate(opts: { quiet?: boolean; ignoreWorkDays?: boolean } = {}) {
    if (isPast) return;
    const keep = dayBlocks.filter(
      (b) => b.kind === "event" || b.locked || b.source === "manual" || (isToday && b.startMin < nowMin),
    );
    const remove = dayBlocks.filter((b) => !keep.includes(b));
    const tasks = data.tasks.filter((t) => !plannedElsewhere.has(t.id));
    const result = planDay({
      date,
      nowMin: isToday ? nowMin : null,
      profile,
      tasks,
      fixedBlocks: keep,
      ignoreWorkDays: opts.ignoreWorkDays,
    });
    applyPlan(
      remove.map((b) => b.id),
      result.blocks,
      `Planned ${relativeDayLabel(date, today).toLowerCase()}: ${result.blocks.filter((b) => b.kind === "task").length} blocks`,
    );
    const next = { ...loadExplanations(), [date]: { reasons: result.reasons, unscheduled: result.unscheduled, generatedAt: new Date().toISOString() } };
    try {
      window.sessionStorage.setItem(EXPLAIN_KEY, JSON.stringify(next));
    } catch {}
    setExplanations(next);
    if (opts.quiet) return;
    const scheduled = result.blocks.filter((b) => b.kind === "task").length;
    if (!result.stats.isWorkDay) toast.info("That's not one of your working days, so nothing was scheduled.");
    else if (scheduled === 0 && result.unscheduled.length === 0) toast.info("No open tasks to plan. Add some first.");
    else if (result.stats.overloaded)
      toast.warning("Your plan is over capacity", {
        description: `${formatDuration(result.stats.overloadMinutes)} of work due by ${relativeDayLabel(date, today).toLowerCase()} doesn't fit.`,
      });
    else toast.success(`Planned ${scheduled} block${scheduled === 1 ? "" : "s"}`);
  }

  // Auto-generate once when arriving with ?generate=1 (e.g. from the brain dump).
  useEffect(() => {
    if (autoRan.current || params.get("generate") !== "1") return;
    autoRan.current = true;
    generate();
    router.replace("/planner");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function clearPlan() {
    const removable = dayBlocks.filter((b) => b.source === "planner" && !b.locked && !(isToday && b.startMin < nowMin));
    if (!removable.length) return;
    for (const b of removable) deleteBlock(b.id);
    toast("Cleared the generated plan", {
      action: { label: "Undo", onClick: () => upsertBlocks(removable) },
    });
  }

  const movable = (b: ScheduleBlock) => b.kind !== "event" && !b.locked && !(isToday && b.startMin < nowMin);

  function move(block: ScheduleBlock, dir: -1 | 1) {
    const candidates = dayBlocks.filter(movable);
    const idx = candidates.findIndex((b) => b.id === block.id);
    const other = candidates[idx + dir];
    if (!other) return;
    const res = swapBlocks(block, other, dayBlocks);
    if (!res.ok) return toast.error(res.error);
    upsertBlocks(res.blocks);
  }

  // ---- Live, honest view of the day -------------------------------------
  const view = useMemo(() => {
    const from = isToday ? Math.max(workStart, nowMin) : workStart;
    const free = isPast || !isWorkDay ? 0 : freeIntervals(dayBlocks, from, workEnd).reduce((s, [a, b]) => s + b - a, 0);
    const taskBlocks = dayBlocks.filter((b) => b.kind === "task");
    const planned = taskBlocks.reduce((s, b) => s + b.endMin - b.startMin, 0);
    const scheduledIds = new Set(taskBlocks.map((b) => b.taskId));
    const explanation = explanations[date];
    const reasonFor = new Map(explanation?.unscheduled.map((u) => [u.taskId, u.reason]));
    const open = data.tasks.filter((t) => t.status !== "done" && !scheduledIds.has(t.id) && !plannedElsewhere.has(t.id));
    const mustDo = open.filter((t) => t.dueDate && t.dueDate <= date);
    const canWait = open.filter((t) => !t.dueDate || t.dueDate > date);
    const conflicts = findConflicts(dayBlocks.filter((b) => b.kind !== "break"));
    return { free, planned, mustDo, canWait, reasonFor, conflicts, explanation };
  }, [dayBlocks, data.tasks, date, explanations, isPast, isToday, isWorkDay, nowMin, plannedElsewhere, workEnd, workStart]);

  const mustDoMinutes = view.mustDo.reduce((s, t) => s + t.estimatedMinutes, 0);
  const hasPlan = dayBlocks.some((b) => b.kind === "task");
  const topReasons = view.explanation
    ? dayBlocks
        .filter((b) => b.kind === "task" && b.taskId && view.explanation!.reasons[b.taskId]?.length)
        .filter((b, i, arr) => arr.findIndex((x) => x.taskId === b.taskId) === i)
        .slice(0, 4)
    : [];

  function scheduleManually(task: Task) {
    const duration = Math.min(task.estimatedMinutes, workEnd - workStart);
    const slot = findFreeSlot(duration, data.blocks, date, profile, isToday ? nowMin : 0);
    const startMin = slot ?? workStart;
    setEditor({
      date,
      startMin,
      endMin: Math.min(1440, startMin + duration),
      kind: "task",
      taskId: task.id,
      title: task.title,
      locked: true,
      source: "manual",
    });
    if (slot === null) toast.info("No free slot is long enough. Pick a time or shorten the block.");
  }

  return (
    <div>
      <PageHeader
        title="Planner"
        description="A realistic schedule built around your working hours, commitments and deadlines. Nothing is squeezed in that doesn't fit."
        actions={
          <>
            <Button variant="outline" onClick={() => {
                const startMin = isToday ? Math.min(23 * 60, Math.max(workStart, Math.ceil(nowMin / 30) * 30)) : workStart;
                setEditor({ date, startMin, endMin: startMin + 60, kind: "event", taskId: null, title: "", locked: true, source: "manual" });
              }}>
              <CalendarPlus /> Add event
            </Button>
            <Button onClick={() => generate()} disabled={isPast}>
              {hasPlan ? <RefreshCw /> : <Sparkles />}
              {hasPlan ? "Regenerate plan" : "Plan my day"}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[0, 1, 2].map((offset) => {
          const d = addDays(today, offset);
          return (
            <Button key={d} variant={date === d ? "secondary" : "ghost"} size="sm" onClick={() => setDate(d)} aria-pressed={date === d}>
              {relativeDayLabel(d, today)}
            </Button>
          );
        })}
        <Input
          type="date"
          aria-label="Plan another date"
          value={date}
          min={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-7 w-40"
        />
        <span className="ml-auto text-sm text-muted-foreground">{formatLongDate(date)}</span>
      </div>

      {!isWorkDay && !isPast && (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2"><Info className="size-4 text-muted-foreground" /> This isn&apos;t one of your working days.</p>
          <Button size="sm" variant="outline" onClick={() => generate({ ignoreWorkDays: true })}>Plan it anyway</Button>
        </div>
      )}

      {view.conflicts.length > 0 && (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {view.conflicts.length} scheduling conflict{view.conflicts.length === 1 ? "" : "s"}: “{view.conflicts[0][0].title}” overlaps “{view.conflicts[0][1].title}”.
          </p>
          <Button size="sm" variant="outline" onClick={() => generate()} disabled={isPast}>
            <RefreshCw /> Re-plan to resolve
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Free time left" value={formatDuration(view.free)} hint={`${formatClock(workStart)}–${formatClock(workEnd)}`} />
        <StatTile label="Planned work" value={formatDuration(view.planned)} hint={`${dayBlocks.filter((b) => b.kind === "task").length} blocks`} />
        <StatTile
          label="Due & unplanned"
          value={formatDuration(mustDoMinutes)}
          hint={`${view.mustDo.length} task${view.mustDo.length === 1 ? "" : "s"}`}
          className={cn(view.mustDo.length > 0 && "border-destructive/40 bg-destructive/5")}
        />
        <StatTile
          label="Capacity"
          value={mustDoMinutes > view.free ? "Over" : view.mustDo.length ? "Tight" : "OK"}
          hint={mustDoMinutes > view.free ? `${formatDuration(mustDoMinutes - view.free)} too much` : "for work due by this day"}
          className={cn(mustDoMinutes > view.free && "border-destructive/40 bg-destructive/5")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="min-w-0">
          <PanelHeader
            icon={CalendarRange}
            title={`Schedule for ${relativeDayLabel(date, today).toLowerCase()}`}
            description="Use the arrows to reorder, the lock to keep a block in place when re-planning."
            action={
              hasPlan ? (
                <Button size="sm" variant="ghost" onClick={clearPlan} disabled={isPast}>
                  <Eraser /> Clear
                </Button>
              ) : undefined
            }
          />
          <div className="p-3">
            {dayBlocks.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title={isPast ? "Nothing was scheduled this day" : "No plan yet"}
                description={isPast ? undefined : "Generate a plan to fit your open tasks into the free time you have."}
                action={!isPast ? <Button onClick={() => generate()}><Sparkles /> Plan my day</Button> : undefined}
              />
            ) : (
              <ol className="space-y-1.5">
                {dayBlocks.map((b) => {
                  const task = b.taskId ? taskById.get(b.taskId) : undefined;
                  const status = blockStatus(b, task, isToday, isPast, nowMin);
                  const canMove = movable(b);
                  return (
                    <li
                      key={b.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                        status === "current" && "border-primary/50 bg-primary/8",
                        status === "missed" && "border-destructive/30",
                        status === "done" && "opacity-70",
                        b.kind === "break" && "stripes border-dashed",
                        b.kind === "event" && "bg-info/5",
                      )}
                    >
                      <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatClock(b.startMin)}–{formatClock(b.endMin)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <button
                          type="button"
                          className={cn("block max-w-full truncate text-left text-sm", status === "done" && "line-through", b.taskId && "hover:underline")}
                          onClick={() => (b.taskId ? openTask(b.taskId) : b.kind === "event" && setEditor(b))}
                        >
                          {b.kind === "break" && <Coffee className="mr-1.5 inline size-3.5 text-muted-foreground" aria-hidden />}
                          {b.title}
                        </button>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {formatDuration(b.endMin - b.startMin)} · {STATUS_LABEL[status]}
                          {task && <PriorityBadge priority={task.priority} />}
                          {b.locked && b.kind === "task" && <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Locked</span>}
                          {b.source === "manual" && b.kind === "task" && <span>Manual</span>}
                        </span>
                      </span>
                      {b.kind !== "event" && !isPast && (
                        <span className="flex shrink-0 items-center">
                          <Button size="icon-sm" variant="ghost" disabled={!canMove} onClick={() => move(b, -1)} aria-label={`Move “${b.title}” earlier`}>
                            <ArrowUp />
                          </Button>
                          <Button size="icon-sm" variant="ghost" disabled={!canMove} onClick={() => move(b, 1)} aria-label={`Move “${b.title}” later`}>
                            <ArrowDown />
                          </Button>
                          {b.kind === "task" && (
                            <>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => upsertBlock({ ...b, locked: !b.locked })}
                                aria-label={b.locked ? `Unlock “${b.title}”` : `Lock “${b.title}”`}
                                aria-pressed={b.locked}
                              >
                                {b.locked ? <Lock className="text-primary" /> : <LockOpen />}
                              </Button>
                              <Button size="icon-sm" variant="ghost" onClick={() => setEditor(b)} aria-label={`Reschedule “${b.title}”`}>
                                <Pencil />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              const undo = deleteBlock(b.id);
                              toast("Removed from plan", { description: b.title, action: undo ? { label: "Undo", onClick: undo } : undefined });
                            }}
                            aria-label={`Remove “${b.title}” from the plan`}
                          >
                            <X />
                          </Button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {dayBlocks.length > 0 && (
            <div className="border-t p-3">
              <details className="group">
                <summary className="cursor-pointer list-none px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                  <span className="group-open:hidden">Show timeline view</span>
                  <span className="hidden group-open:inline">Hide timeline view</span>
                </summary>
                <div className="mt-3 px-1">
                  <DayTimeline
                    date={date}
                    blocks={dayBlocks}
                    tasks={data.tasks}
                    today={today}
                    nowMin={nowMin}
                    startMin={Math.min(workStart, ...dayBlocks.map((b) => b.startMin)) - 30 < 0 ? 0 : Math.floor((Math.min(workStart, ...dayBlocks.map((b) => b.startMin)) - 30) / 60) * 60}
                    endMin={Math.min(1440, Math.ceil((Math.max(workEnd, ...dayBlocks.map((b) => b.endMin)) + 30) / 60) * 60)}
                    workStart={workStart}
                    workEnd={workEnd}
                    onBlockClick={(b) => (b.taskId ? openTask(b.taskId) : setEditor(b))}
                  />
                </div>
              </details>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          {topReasons.length > 0 && (
            <Panel>
              <PanelHeader icon={Sparkles} title="Why this order" description="How the planner prioritized your most important work." />
              <ul className="space-y-3 p-5 pt-4">
                {topReasons.map((b) => (
                  <li key={b.id} className="text-sm">
                    <p className="truncate font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{view.explanation!.reasons[b.taskId!].join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel>
            <PanelHeader
              icon={AlertTriangle}
              title="Doesn't fit"
              description={view.mustDo.length ? "Due by this day but not scheduled. Something has to give." : "Everything due by this day is scheduled."}
            />
            <div className="p-2 pb-3">
              {view.mustDo.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" /> All clear
                </p>
              ) : (
                <UnscheduledList tasks={view.mustDo} reasonFor={view.reasonFor} onSchedule={scheduleManually} onOpen={openTask} disabled={isPast} danger />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Can wait" description="Open tasks without a deadline on this day that aren't scheduled." />
            <div className="p-2 pb-3">
              {view.canWait.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Nothing else waiting.</p>
              ) : (
                <UnscheduledList tasks={view.canWait.slice(0, 12)} reasonFor={view.reasonFor} onSchedule={scheduleManually} onOpen={openTask} disabled={isPast} />
              )}
              {view.canWait.length > 12 && <p className="px-3 text-xs text-muted-foreground">+{view.canWait.length - 12} more in Tasks</p>}
            </div>
          </Panel>
        </div>
      </div>

      <BlockEditorDialog draft={editor} onClose={() => setEditor(null)} />
    </div>
  );
}

function UnscheduledList({
  tasks,
  reasonFor,
  onSchedule,
  onOpen,
  disabled,
  danger,
}: {
  tasks: Task[];
  reasonFor: Map<string, string>;
  onSchedule: (t: Task) => void;
  onOpen: (id: string) => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <ul>
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-muted/40">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t.id)}>
            <span className="block truncate text-sm">{t.title}</span>
            <span className={cn("text-xs", danger ? "text-destructive" : "text-muted-foreground")}>
              {formatDuration(t.estimatedMinutes)} · {reasonFor.get(t.id) ?? "Not scheduled yet"}
            </span>
          </button>
          <Button size="xs" variant="outline" disabled={disabled} onClick={() => onSchedule(t)}>
            Schedule
          </Button>
        </li>
      ))}
    </ul>
  );
}
