"use client";

import { useMemo, useState } from "react";
import { cn } from "cn";
import { Activity, BarChart3, CheckCircle2, Clock3, Flame, History, ListChecks, Plus, RotateCcw, Timer, Trash2, CalendarRange, Repeat } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, Panel, PanelHeader, StatTile } from "@/components/app/primitives";
import { RateLineChart, SingleBarChart, TrendAreaChart, TwoSeriesBarChart } from "@/components/app/charts";
import { useAppData } from "@/lib/store";
import { useClock } from "@/hooks/use-clock";
import { activeDayStreak, dailyStats, heatmap, isOverdue, priorityDistribution, weeklyStats } from "@/lib/analytics";
import { formatDuration, formatShortDate, isoToLocalDate, minutesInTz, formatClock, relativeDayLabel, weekdayShort } from "@/lib/time";
import { PRIORITY_LABEL, type ActivityEvent } from "@/lib/types";

const RANGES = [7, 14, 30] as const;

const ACTIVITY_META: Record<ActivityEvent["type"], { label: string; icon: typeof Plus }> = {
  task_created: { label: "Added", icon: Plus },
  task_completed: { label: "Completed", icon: CheckCircle2 },
  task_reopened: { label: "Reopened", icon: RotateCcw },
  task_deleted: { label: "Deleted", icon: Trash2 },
  focus_completed: { label: "Focused on", icon: Timer },
  plan_generated: { label: "", icon: CalendarRange },
  habit_logged: { label: "Checked in:", icon: Repeat },
};

export default function AnalyticsPage() {
  const data = useAppData();
  const { today, nowMin } = useClock();
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);

  const m = useMemo(() => {
    const days = dailyStats(data, today, range);
    const weeks = weeklyStats(data, today, 8);
    const completed = days.reduce((s, d) => s + d.completed, 0);
    const due = days.reduce((s, d) => s + d.due, 0);
    const dueDone = days.reduce((s, d) => s + d.dueDone, 0);
    const focus = days.reduce((s, d) => s + d.focusMinutes, 0);
    return {
      days,
      weeks: weeks.map((w) => ({ ...w, ratePct: w.rate === null ? null : Math.round(w.rate * 100) })),
      completed,
      rate: due ? dueDone / due : null,
      due,
      focus,
      avgFocus: focus / range,
      overdueNow: data.tasks.filter((t) => isOverdue(t, today, nowMin)).length,
      streak: activeDayStreak(data, today),
      priority: priorityDistribution(data.tasks).map((p) => ({ ...p, label: PRIORITY_LABEL[p.priority] })).reverse(),
      heat: heatmap(data, today, 12),
    };
  }, [data, today, nowMin, range]);

  const isEmpty = data.tasks.length === 0 && data.focusSessions.length === 0;
  const recentActivity = [...data.activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14);
  const tz = data.profile.timezone;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Calculated from your saved tasks, focus sessions and habits. No estimates, no made-up numbers."
        actions={
          <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v) as (typeof RANGES)[number])}>
            <TabsList aria-label="Date range">
              {RANGES.map((r) => (
                <TabsTrigger key={r} value={String(r)}>{r} days</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {isEmpty ? (
        <Panel>
          <EmptyState
            icon={BarChart3}
            title="Nothing to analyze yet"
            description="Complete a few tasks or focus sessions and your trends will appear here."
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Completed" value={m.completed} hint={`last ${range} days`} />
            <StatTile
              label="On-time rate"
              value={m.rate === null ? "–" : `${Math.round(m.rate * 100)}%`}
              hint={m.rate === null ? "no deadlines in range" : `of ${m.due} tasks with a deadline`}
            />
            <StatTile label="Focus time" value={formatDuration(m.focus)} hint={`≈ ${formatDuration(m.avgFocus)} per day`} />
            <StatTile label="Overdue now" value={m.overdueNow} hint="open past deadline" className={cn(m.overdueNow > 0 && "border-destructive/30")} />
            <StatTile
              label="Active streak"
              value={<span className="inline-flex items-center gap-1">{m.streak}{m.streak > 0 && <Flame className="size-5 text-primary" aria-hidden />}</span>}
              hint="days with progress"
              className="col-span-2 lg:col-span-1"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader icon={ListChecks} title="Tasks completed" description="Per day, by completion date." />
              <div className="p-4 pt-2">
                <SingleBarChart data={m.days} xKey="label" yKey="completed" name="Completed" color="var(--chart-1)" yLabel="Tasks" />
              </div>
            </Panel>
            <Panel>
              <PanelHeader icon={Timer} title="Focus minutes" description="Focused time logged per day." />
              <div className="p-4 pt-2">
                <SingleBarChart
                  data={m.days}
                  xKey="label"
                  yKey="focusMinutes"
                  name="Focus"
                  color="var(--chart-2)"
                  yLabel="Minutes"
                  format={(v) => formatDuration(v)}
                />
              </div>
            </Panel>
            <Panel>
              <PanelHeader
                icon={CheckCircle2}
                title="Weekly on-time completion"
                description="Share of tasks due each week that were done by their deadline. Gaps mean nothing was due."
              />
              <div className="p-4 pt-2">
                <RateLineChart data={m.weeks} xKey="label" yKey="ratePct" name="On time" color="var(--chart-3)" />
              </div>
            </Panel>
            <Panel>
              <PanelHeader icon={Clock3} title="Overdue tasks" description="Open tasks past their deadline at the end of each day." />
              <div className="p-4 pt-2">
                <TrendAreaChart data={m.days} xKey="label" yKey="overdueOpen" name="Overdue" color="var(--chart-5)" yLabel="Tasks" />
              </div>
            </Panel>
            <Panel>
              <PanelHeader icon={BarChart3} title="Priority distribution" description="All tasks, open vs. completed." />
              <div className="p-4 pt-2">
                <TwoSeriesBarChart
                  data={m.priority}
                  xKey="label"
                  layout="vertical"
                  yLabel="Tasks"
                  series={[
                    { key: "open", name: "Open", color: "var(--chart-1)" },
                    { key: "done", name: "Completed", color: "var(--chart-2)" },
                  ]}
                />
              </div>
            </Panel>
            <Panel>
              <PanelHeader icon={Activity} title="Activity, last 12 weeks" description="Completed tasks, focus sessions and habit check-ins per day." />
              <div className="p-5 pt-4">
                <Heatmap cells={m.heat} today={today} />
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader icon={History} title="Recent activity" />
              <div className="p-2 pb-3">
                {recentActivity.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No activity recorded yet.</p>
                ) : (
                  <ul>
                    {recentActivity.map((a) => {
                      const meta = ACTIVITY_META[a.type];
                      const date = isoToLocalDate(a.at, tz);
                      return (
                        <li key={a.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                          <meta.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">
                            {meta.label && <span className="text-muted-foreground">{meta.label} </span>}
                            {a.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {relativeDayLabel(date, today)} {formatClock(minutesInTz(new Date(a.at), tz))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Daily data" description="The numbers behind the charts above." />
              <div className="max-h-96 overflow-auto px-5 pt-3 pb-5">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Daily productivity data for the last {range} days</caption>
                  <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 font-medium">Day</th>
                      <th scope="col" className="py-2 text-right font-medium">Completed</th>
                      <th scope="col" className="py-2 text-right font-medium">Due</th>
                      <th scope="col" className="py-2 text-right font-medium">On time</th>
                      <th scope="col" className="py-2 text-right font-medium">Focus</th>
                      <th scope="col" className="py-2 text-right font-medium">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[...m.days].reverse().map((d) => (
                      <tr key={d.date} className="border-t border-border/60">
                        <th scope="row" className="py-1.5 font-normal">{weekdayShort(d.date)} {formatShortDate(d.date)}</th>
                        <td className="py-1.5 text-right">{d.completed}</td>
                        <td className="py-1.5 text-right">{d.due}</td>
                        <td className="py-1.5 text-right">{d.dueDone}</td>
                        <td className="py-1.5 text-right">{formatDuration(d.focusMinutes)}</td>
                        <td className="py-1.5 text-right">{d.overdueOpen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Heatmap({ cells, today }: { cells: Array<{ date: string; count: number }>; today: string }) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const opacity = [0, 0.25, 0.45, 0.7, 1];
  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="img" aria-label="Daily activity heatmap for the last 12 weeks">
        {weeks.map((w) => (
          <div key={w[0].date} className="grid grid-rows-7 gap-1">
            {w.map((c) => (
              <span
                key={c.date}
                title={`${formatShortDate(c.date)}: ${c.count} ${c.count === 1 ? "activity" : "activities"}`}
                className={cn("size-3.5 rounded-[3px] bg-muted sm:size-4", c.date === today && "ring-1 ring-foreground/40")}
                style={c.count ? { background: `color-mix(in oklch, var(--chart-1) ${opacity[level(c.count)] * 100}%, var(--muted))` } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className="size-3 rounded-[3px] bg-muted"
            style={l ? { background: `color-mix(in oklch, var(--chart-1) ${opacity[l] * 100}%, var(--muted))` } : undefined}
            aria-hidden
          />
        ))}
        More
      </div>
    </div>
  );
}
