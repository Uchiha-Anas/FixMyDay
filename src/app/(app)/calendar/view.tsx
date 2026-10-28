"use client";

import { useState } from "react";
import { cn } from "cn";
import { CalendarPlus, ChevronLeft, ChevronRight, Flag, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Panel } from "@/components/app/primitives";
import { DayTimeline, blockStatus, STATUS_LABEL, type BlockStatus } from "@/components/app/timeline";
import { BlockEditorDialog, type BlockDraft } from "@/components/app/block-editor";
import { useAppData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useClock } from "@/hooks/use-clock";
import { findConflicts } from "@/lib/scheduler";
import { addDays, formatClock, formatLongDate, formatShortDate, toMinutes, weekDates, weekdayShort } from "@/lib/time";
import type { ScheduleBlock } from "@/lib/types";

const LEGEND: BlockStatus[] = ["upcoming", "current", "done", "missed", "event", "break"];
const LEGEND_SWATCH: Record<BlockStatus, string> = {
  upcoming: "bg-primary/30",
  current: "bg-primary",
  done: "bg-success/50",
  missed: "bg-destructive/50",
  event: "bg-info/50",
  break: "bg-muted-foreground/30",
};

export default function CalendarPage() {
  const data = useAppData();
  const { today, nowMin } = useClock();
  const openTask = useUI((s) => s.openTask);
  const [view, setView] = useState<"day" | "week">("week");
  const [cursor, setCursor] = useState(today);
  const [editor, setEditor] = useState<BlockDraft | null>(null);

  const workStart = toMinutes(data.profile.workStart);
  const workEnd = toMinutes(data.profile.workEnd);
  const days = view === "week" ? weekDates(cursor, data.profile.weekStartsOn) : [cursor];
  const visible = data.blocks.filter((b) => days.includes(b.date));
  const rangeStart = Math.max(0, Math.floor((Math.min(workStart, ...visible.map((b) => b.startMin)) - 60) / 60) * 60);
  const rangeEnd = Math.min(1440, Math.ceil((Math.max(workEnd, ...visible.map((b) => b.endMin)) + 60) / 60) * 60);

  const conflictCount = findConflicts(visible.filter((b) => b.kind !== "break")).length;
  const step = view === "week" ? 7 : 1;

  const editBlock = (b: ScheduleBlock) => {
    if (b.kind === "break") return;
    setEditor(b);
  };

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Info className="size-3.5" aria-hidden />
            Your FixMyDay schedule. External calendars (e.g. Google Calendar) are not connected.
          </span>
        }
        actions={
          <Button
            onClick={() =>
              setEditor({ date: cursor, startMin: workStart, endMin: workStart + 60, kind: "event", taskId: null, title: "", locked: true, source: "manual" })
            }
          >
            <CalendarPlus /> Add event
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setCursor(addDays(cursor, -step))} aria-label={`Previous ${view}`}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCursor(today)}>Today</Button>
        <Button variant="outline" size="icon-sm" onClick={() => setCursor(addDays(cursor, step))} aria-label={`Next ${view}`}>
          <ChevronRight />
        </Button>
        <h2 className="ml-1 text-sm font-medium">
          {view === "week" ? `${formatShortDate(days[0])} – ${formatShortDate(days[6])}` : formatLongDate(cursor)}
        </h2>
        <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week")} className="ml-auto">
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", LEGEND_SWATCH[s])} aria-hidden /> {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><Flag className="size-3 text-warning" /> Deadline</span>
        {conflictCount > 0 && <span className="font-medium text-destructive">{conflictCount} conflict{conflictCount === 1 ? "" : "s"} in view</span>}
      </div>

      {view === "day" ? (
        <Panel className="p-4">
          <DeadlineStrip date={cursor} />
          <DayTimeline
            date={cursor}
            blocks={visible}
            tasks={data.tasks}
            today={today}
            nowMin={nowMin}
            startMin={rangeStart}
            endMin={rangeEnd}
            pxPerMin={1.3}
            workStart={workStart}
            workEnd={workEnd}
            onBlockClick={editBlock}
          />
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <WeekGrid
            days={days}
            blocks={visible}
            today={today}
            nowMin={nowMin}
            startMin={rangeStart}
            endMin={rangeEnd}
            onBlockClick={editBlock}
            onTaskOpen={openTask}
            onDayClick={(d) => {
              setCursor(d);
              setView("day");
            }}
          />
        </Panel>
      )}

      <BlockEditorDialog draft={editor} onClose={() => setEditor(null)} />
    </div>
  );
}

function DeadlineStrip({ date }: { date: string }) {
  const data = useAppData();
  const openTask = useUI((s) => s.openTask);
  const due = data.tasks.filter((t) => t.dueDate === date && t.status !== "done" && !t.dueTime);
  if (!due.length) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {due.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => openTask(t.id)}
          className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-warning/12 px-2 py-1 text-xs text-warning hover:bg-warning/20"
        >
          <Flag className="size-3 shrink-0" /> Due: {t.title}
        </button>
      ))}
    </div>
  );
}

function WeekGrid({
  days,
  blocks,
  today,
  nowMin,
  startMin,
  endMin,
  onBlockClick,
  onTaskOpen,
  onDayClick,
}: {
  days: string[];
  blocks: ScheduleBlock[];
  today: string;
  nowMin: number;
  startMin: number;
  endMin: number;
  onBlockClick: (b: ScheduleBlock) => void;
  onTaskOpen: (id: string) => void;
  onDayClick: (d: string) => void;
}) {
  const data = useAppData();
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  const px = 0.9;
  const pad = 10; // keeps the first and last hour labels clear of the edges
  const height = (endMin - startMin) * px + pad * 2;
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const conflictIds = new Set(findConflicts(blocks.filter((b) => b.kind !== "break")).flat().map((b) => b.id));

  return (
    <div className="min-w-[760px]">
      <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-card">
        <div />
        {days.map((d) => {
          const deadlines = data.tasks.filter((t) => t.dueDate === d && t.status !== "done");
          return (
            <div key={d} className="border-l px-2 py-2">
              <button type="button" onClick={() => onDayClick(d)} className="flex items-baseline gap-1.5 hover:underline">
                <span className="text-xs text-muted-foreground">{weekdayShort(d)}</span>
                <span className={cn("text-sm font-medium tabular-nums", d === today && "grid size-6 place-items-center rounded-full bg-primary text-primary-foreground")}>
                  {Number(d.slice(8))}
                </span>
              </button>
              <div className="mt-1 space-y-0.5">
                {deadlines.slice(0, 2).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onTaskOpen(t.id)}
                    className={cn(
                      "block w-full truncate rounded px-1 text-left text-[10px]",
                      d < today ? "bg-destructive/12 text-destructive" : "bg-warning/12 text-warning",
                    )}
                    title={t.title}
                  >
                    <Flag className="mr-0.5 inline size-2.5" aria-hidden />
                    {t.dueTime ? `${formatClock(toMinutes(t.dueTime))} ` : ""}
                    {t.title}
                  </button>
                ))}
                {deadlines.length > 2 && <span className="block text-[10px] text-muted-foreground">+{deadlines.length - 2} more due</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height }}>
        <div className="relative">
          {hours.map((m) => (
            <span key={m} className="absolute right-2 -translate-y-2 text-[10px] text-muted-foreground tabular-nums" style={{ top: (m - startMin) * px + pad }}>
              {formatClock(m)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className={cn("relative border-l", d === today && "bg-primary/[0.03]")}>
            {hours.map((m) => (
              <span key={m} className="absolute inset-x-0 h-px bg-border/70" style={{ top: (m - startMin) * px + pad }} aria-hidden />
            ))}
            {blocks
              .filter((b) => b.date === d)
              .map((b) => {
                const task = b.taskId ? taskById.get(b.taskId) : undefined;
                const status = blockStatus(b, task, d === today, d < today, nowMin);
                const top = (Math.max(b.startMin, startMin) - startMin) * px + pad;
                const h = Math.max(14, (Math.min(b.endMin, endMin) - Math.max(b.startMin, startMin)) * px - 2);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onBlockClick(b)}
                    disabled={b.kind === "break"}
                    title={`${b.title} · ${formatClock(b.startMin)}–${formatClock(b.endMin)} · ${STATUS_LABEL[status]}`}
                    aria-label={`${b.title}, ${formatClock(b.startMin)} to ${formatClock(b.endMin)}, ${STATUS_LABEL[status]}`}
                    className={cn(
                      "absolute inset-x-1 overflow-hidden rounded-md border px-1.5 text-left text-[11px] leading-tight",
                      status === "upcoming" && "border-primary/30 bg-primary/12",
                      status === "current" && "border-primary bg-primary/25",
                      status === "done" && "border-success/30 bg-success/10 text-muted-foreground line-through",
                      status === "missed" && "border-destructive/40 bg-destructive/10",
                      status === "event" && "border-info/30 bg-info/12",
                      status === "break" && "stripes border-dashed bg-muted/30 text-muted-foreground",
                      conflictIds.has(b.id) && "ring-1 ring-destructive",
                    )}
                    style={{ top, height: h }}
                  >
                    <span className="block truncate font-medium">{b.title}</span>
                    {h > 30 && <span className="block text-[10px] text-muted-foreground no-underline">{formatClock(b.startMin)}</span>}
                  </button>
                );
              })}
            {d === today && nowMin >= startMin && nowMin <= endMin && (
              <span className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-primary" style={{ top: (nowMin - startMin) * px + pad }} aria-hidden />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
