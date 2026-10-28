import type { AppData, Category, Habit, HabitLog, Priority, Task } from "./types";
import { CATEGORIES, PRIORITIES } from "./types";
import { addDays, formatShortDate, isoToLocalDate, startOfWeek, weekdayShort } from "./time";

export interface DayStat {
  date: string;
  label: string;
  completed: number;
  created: number;
  focusMinutes: number;
  /** Tasks whose deadline was this day. */
  due: number;
  /** …of which were completed by the end of that day. */
  dueDone: number;
  /** Open tasks past their deadline at the end of this day. */
  overdueOpen: number;
}

function localDate(iso: string | null, tz: string): string | null {
  return iso ? isoToLocalDate(iso, tz) : null;
}

export function dailyStats(data: AppData, today: string, days: number): DayStat[] {
  const tz = data.profile.timezone;
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const index = new Map(dates.map((d, i) => [d, i]));
  const stats: DayStat[] = dates.map((date) => ({
    date,
    label: days <= 7 ? weekdayShort(date) : formatShortDate(date),
    completed: 0, created: 0, focusMinutes: 0, due: 0, dueDone: 0, overdueOpen: 0,
  }));

  for (const t of data.tasks) {
    const completed = t.status === "done" ? localDate(t.completedAt, tz) : null;
    const created = localDate(t.createdAt, tz);
    if (completed && index.has(completed)) stats[index.get(completed)!].completed += 1;
    if (created && index.has(created)) stats[index.get(created)!].created += 1;
    if (t.dueDate && index.has(t.dueDate)) {
      const s = stats[index.get(t.dueDate)!];
      s.due += 1;
      if (completed && completed <= t.dueDate) s.dueDone += 1;
    }
    if (t.dueDate) {
      for (const s of stats) {
        const existed = !created || created <= s.date;
        const stillOpen = !completed || completed > s.date;
        if (existed && stillOpen && t.dueDate < s.date) s.overdueOpen += 1;
      }
    }
  }
  for (const f of data.focusSessions) {
    const d = localDate(f.startedAt, tz);
    if (d && index.has(d)) stats[index.get(d)!].focusMinutes += f.focusedMinutes;
  }
  return stats;
}

export interface WeekStat {
  weekStart: string;
  label: string;
  completed: number;
  due: number;
  dueDone: number;
  focusMinutes: number;
  /** Share of tasks due that week finished on time, or null when nothing was due. */
  rate: number | null;
}

export function weeklyStats(data: AppData, today: string, weeks: number): WeekStat[] {
  const days = dailyStats(data, today, weeks * 7 + 6);
  const firstWeek = startOfWeek(addDays(today, -(weeks - 1) * 7), data.profile.weekStartsOn);
  const out: WeekStat[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(firstWeek, i * 7);
    return { weekStart, label: formatShortDate(weekStart), completed: 0, due: 0, dueDone: 0, focusMinutes: 0, rate: null };
  });
  for (const d of days) {
    const ws = startOfWeek(d.date, data.profile.weekStartsOn);
    const w = out.find((x) => x.weekStart === ws);
    if (!w) continue;
    w.completed += d.completed;
    w.due += d.due;
    w.dueDone += d.dueDone;
    w.focusMinutes += d.focusMinutes;
  }
  for (const w of out) w.rate = w.due > 0 ? w.dueDone / w.due : null;
  return out;
}

export function priorityDistribution(tasks: Task[]): Array<{ priority: Priority; open: number; done: number }> {
  return PRIORITIES.map((priority) => ({
    priority,
    open: tasks.filter((t) => t.priority === priority && t.status !== "done").length,
    done: tasks.filter((t) => t.priority === priority && t.status === "done").length,
  }));
}

export function categoryDistribution(tasks: Task[]): Array<{ category: Category; count: number }> {
  return CATEGORIES.map((category) => ({ category, count: tasks.filter((t) => t.category === category).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Tasks that matter today: due today, overdue, scheduled today, or completed today. */
export function todaysTasks(data: AppData, today: string): Task[] {
  const tz = data.profile.timezone;
  const scheduled = new Set(data.blocks.filter((b) => b.date === today && b.taskId).map((b) => b.taskId));
  return data.tasks.filter((t) => {
    if (t.status === "done") return localDate(t.completedAt, tz) === today;
    return scheduled.has(t.id) || (t.dueDate !== null && t.dueDate <= today);
  });
}

export function isOverdue(t: Task, today: string, nowMin: number): boolean {
  if (t.status === "done" || !t.dueDate) return false;
  if (t.dueDate < today) return true;
  if (t.dueDate === today && t.dueTime) {
    const [h, m] = t.dueTime.split(":").map(Number);
    return h * 60 + m < nowMin;
  }
  return false;
}

/** Consecutive days with at least one completion or focus session. Today counts only once active. */
export function activeDayStreak(data: AppData, today: string): number {
  const tz = data.profile.timezone;
  const active = new Set<string>();
  for (const t of data.tasks) {
    const d = t.status === "done" ? localDate(t.completedAt, tz) : null;
    if (d) active.add(d);
  }
  for (const f of data.focusSessions) active.add(isoToLocalDate(f.startedAt, tz));
  let day = active.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (active.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export function heatmap(data: AppData, today: string, weeks: number): Array<{ date: string; count: number }> {
  const tz = data.profile.timezone;
  const start = startOfWeek(addDays(today, -(weeks - 1) * 7), data.profile.weekStartsOn);
  const counts = new Map<string, number>();
  const bump = (d: string | null) => d && counts.set(d, (counts.get(d) ?? 0) + 1);
  for (const t of data.tasks) if (t.status === "done") bump(localDate(t.completedAt, tz));
  for (const f of data.focusSessions) bump(isoToLocalDate(f.startedAt, tz));
  for (const l of data.habitLogs) bump(l.date);
  const out: Array<{ date: string; count: number }> = [];
  for (let d = start; d <= today; d = addDays(d, 1)) out.push({ date: d, count: counts.get(d) ?? 0 });
  return out;
}

/* ------------------------------------------------------------------------ */
/* Habits                                                                    */
/* ------------------------------------------------------------------------ */

function habitDates(habitId: string, logs: HabitLog[]): Set<string> {
  return new Set(logs.filter((l) => l.habitId === habitId).map((l) => l.date));
}

/**
 * Consecutive logged days ending today, or ending yesterday if today isn't
 * logged yet (the day isn't over, so it doesn't break the streak).
 */
export function habitStreak(habitId: string, logs: HabitLog[], today: string): number {
  const dates = habitDates(habitId, logs);
  let day = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

export function habitWeek(
  habit: Habit,
  logs: HabitLog[],
  today: string,
  weekStartsOn: 0 | 1,
): { done: number; target: number; days: Array<{ date: string; done: boolean; future: boolean }> } {
  const dates = habitDates(habit.id, logs);
  const start = startOfWeek(today, weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, done: dates.has(date), future: date > today };
  });
  return { done: days.filter((d) => d.done).length, target: habit.targetPerWeek, days };
}

/** Share of the last `weeks` full-or-current weeks in which the weekly target was met. */
export function habitConsistency(habit: Habit, logs: HabitLog[], today: string, weekStartsOn: 0 | 1, weeks = 4): number {
  const dates = habitDates(habit.id, logs);
  const current = startOfWeek(today, weekStartsOn);
  let met = 0;
  for (let w = 0; w < weeks; w++) {
    const start = addDays(current, -7 * w);
    let count = 0;
    for (let i = 0; i < 7; i++) if (dates.has(addDays(start, i))) count += 1;
    if (count >= habit.targetPerWeek) met += 1;
  }
  return met / weeks;
}

export function goalProgress(goalId: string, tasks: Task[]): { done: number; total: number; ratio: number } {
  const linked = tasks.filter((t) => t.goalId === goalId);
  const done = linked.filter((t) => t.status === "done").length;
  return { done, total: linked.length, ratio: linked.length ? done / linked.length : 0 };
}
