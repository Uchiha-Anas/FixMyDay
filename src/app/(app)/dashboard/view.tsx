"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarClock,
  CalendarRange,
  Compass,
  Flame,
  ListChecks,
  Plus,
  Timer,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/app/link-button";
import { EmptyState, Panel, PanelHeader, StatTile } from "@/components/app/primitives";
import { BrainDumpInput } from "@/components/app/brain-dump";
import { NextActionCard } from "@/components/app/next-action";
import { AgendaList } from "@/components/app/timeline";
import { TaskRow } from "@/components/app/task-row";
import { ProgressRing } from "@/components/app/progress-ring";
import { useAppData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useClock } from "@/hooks/use-clock";
import { activeDayStreak, dailyStats, isOverdue, todaysTasks } from "@/lib/analytics";
import { formatClock, formatDuration, formatLongDate, greetingFor, relativeDayLabel, toMinutes } from "@/lib/time";
import { cn } from "cn";

export default function DashboardPage() {
  const data = useAppData();
  const { today, nowMin } = useClock();
  const openNewTask = useUI((s) => s.openNewTask);
  const openTask = useUI((s) => s.openTask);
  const setBrainDumpOpen = useUI((s) => s.setBrainDumpOpen);

  const view = useMemo(() => {
    const todays = todaysTasks(data, today).sort(
      (a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"),
    );
    const done = todays.filter((t) => t.status === "done").length;
    const blocks = data.blocks.filter((b) => b.date === today).sort((a, b) => a.startMin - b.startMin);
    const plannedMinutes = blocks.filter((b) => b.kind === "task").reduce((s, b) => s + b.endMin - b.startMin, 0);
    const remainingPlanned = blocks
      .filter((b) => b.kind === "task" && b.endMin > nowMin)
      .filter((b) => data.tasks.find((t) => t.id === b.taskId)?.status !== "done")
      .reduce((s, b) => s + b.endMin - Math.max(b.startMin, nowMin), 0);
    const overdue = data.tasks.filter((t) => isOverdue(t, today, nowMin));
    const upcoming = data.tasks
      .filter((t) => t.status !== "done" && t.dueDate && t.dueDate >= today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"))
      .slice(0, 5);
    const week = dailyStats(data, today, 7);
    return {
      todays,
      done,
      blocks,
      plannedMinutes,
      remainingPlanned,
      overdue,
      upcoming,
      weekCompleted: week.reduce((s, d) => s + d.completed, 0),
      weekFocus: week.reduce((s, d) => s + d.focusMinutes, 0),
      todayFocus: week[week.length - 1]?.focusMinutes ?? 0,
      streak: activeDayStreak(data, today),
      openCount: data.tasks.filter((t) => t.status !== "done").length,
    };
  }, [data, today, nowMin]);

  const name = data.profile.displayName.split(" ")[0];
  const progress = view.todays.length ? view.done / view.todays.length : 0;
  const workEnd = toMinutes(data.profile.workEnd);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">{formatLongDate(today)}</p>
        <h1 className="font-display text-4xl sm:text-5xl">
          {greetingFor(nowMin)}
          {name ? `, ${name}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground">
          {view.todays.length === 0
            ? "Nothing is due or planned for today yet."
            : `${view.done} of ${view.todays.length} tasks done today`}
          {view.remainingPlanned > 0 && ` · ${formatDuration(view.remainingPlanned)} of planned work left`}
          {nowMin < workEnd && ` · your day ends at ${formatClock(workEnd)}`}
        </p>
      </div>

      {view.overdue.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            {view.overdue.length === 1
              ? `“${view.overdue[0].title}” is past its deadline.`
              : `${view.overdue.length} tasks are past their deadline.`}
          </p>
          <div className="flex gap-2">
            {view.overdue.length === 1 ? (
              <Button size="sm" variant="outline" onClick={() => openTask(view.overdue[0].id)}>
                Review
              </Button>
            ) : (
              <LinkButton size="sm" variant="outline" href="/tasks?filter=overdue">
                Review overdue
              </LinkButton>
            )}
            <LinkButton size="sm" variant="ghost" href="/planner?generate=1">
              Replan today
            </LinkButton>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            icon={Brain}
            title="What's on your mind?"
            description="Dump it all here. FixMyDay turns it into tasks you can review before saving."
          />
          <div className="p-5 pt-4">
            <BrainDumpInput />
          </div>
        </Panel>

        <Panel className="relative overflow-hidden lg:col-span-2">
          <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <PanelHeader icon={Compass} title="Do this next" description="Based on deadlines, priority and your schedule." />
          <div className="p-5 pt-4">
            <NextActionCard />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
        <Panel className="lg:col-span-3">
          <PanelHeader
            icon={CalendarRange}
            title="Today's schedule"
            description={
              view.blocks.length
                ? `${formatDuration(view.plannedMinutes)} of focused work planned`
                : "No time blocks yet"
            }
            action={
              <LinkButton size="sm" variant="outline" href="/planner">
                {view.blocks.some((b) => b.kind === "task") ? "Open planner" : "Plan my day"} <ArrowRight />
              </LinkButton>
            }
          />
          <div className="p-3 pt-3">
            {view.blocks.length ? (
              <AgendaList
                blocks={view.blocks}
                tasks={data.tasks}
                nowMin={nowMin}
                onBlockClick={(b) => b.taskId && openTask(b.taskId)}
              />
            ) : (
              <EmptyState
                icon={CalendarRange}
                title="Your day isn't planned yet"
                description="Let the planner fit your open tasks around your working hours and commitments."
                action={
                  <LinkButton size="sm" href="/planner?generate=1">
                    <CalendarRange /> Plan my day
                  </LinkButton>
                }
              />
            )}
          </div>
        </Panel>

        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <PanelHeader icon={ListChecks} title="Today's progress" />
            <div className="flex items-center gap-5 px-5 pt-4">
              <ProgressRing value={progress} label="Tasks completed today">
                <span className="text-lg font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
              </ProgressRing>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold tabular-nums">{view.done}</span>
                  <span className="text-muted-foreground"> of {view.todays.length} done</span>
                </p>
                <p className="text-muted-foreground">
                  {formatDuration(view.todayFocus)} focused today
                </p>
              </div>
            </div>
            <div className="p-2 pb-3">
              {view.todays.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No tasks for today"
                  description="Tasks due today, overdue or scheduled today show up here."
                  action={
                    <Button size="sm" variant="outline" onClick={() => openNewTask({ dueDate: today })}>
                      <Plus /> Add a task for today
                    </Button>
                  }
                />
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {view.todays.slice(0, 8).map((t) => (
                    <TaskRow key={t.id} task={t} today={today} nowMin={nowMin} dense />
                  ))}
                  {view.todays.length > 8 && (
                    <Link href="/tasks" className="block px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      +{view.todays.length - 8} more
                    </Link>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon={CalendarClock} title="Upcoming deadlines" />
            <div className="p-2 pb-3">
              {view.upcoming.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No upcoming deadlines. Nice and calm.</p>
              ) : (
                <ul>
                  {view.upcoming.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openTask(t.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <span className="truncate text-sm">{t.title}</span>
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            t.dueDate === today ? "font-medium text-warning" : "text-muted-foreground",
                          )}
                        >
                          {relativeDayLabel(t.dueDate!, today)}
                          {t.dueTime && ` ${formatClock(toMinutes(t.dueTime))}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            icon={TrendingUp}
            title="This week"
            action={
              <LinkButton size="sm" variant="ghost" href="/analytics">
                Analytics <ArrowRight />
              </LinkButton>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-5 pt-4 sm:grid-cols-4">
            <StatTile label="Completed" value={view.weekCompleted} hint="last 7 days" />
            <StatTile label="Focus" value={formatDuration(view.weekFocus)} hint="last 7 days" />
            <StatTile
              label="Active streak"
              value={
                <span className="inline-flex items-center gap-1">
                  {view.streak}
                  {view.streak > 0 && <Flame className="size-5 text-primary" aria-hidden />}
                </span>
              }
              hint={view.streak === 1 ? "day" : "days"}
            />
            <StatTile label="Open tasks" value={view.openCount} hint={`${view.overdue.length} overdue`} />
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-2 p-5 pt-4">
            <QuickAction icon={Plus} label="Add task" onClick={() => openNewTask()} />
            <QuickAction icon={Brain} label="Brain dump" onClick={() => setBrainDumpOpen(true)} />
            <QuickAction icon={CalendarRange} label="Plan my day" href="/planner?generate=1" />
            <QuickAction icon={Timer} label="Start focus" href="/focus" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  href,
}: {
  icon: typeof Plus;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "flex h-16 flex-col items-start justify-center gap-1 rounded-xl border bg-surface/60 px-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";
  const content = (
    <>
      <Icon className="size-4 text-primary" aria-hidden />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
