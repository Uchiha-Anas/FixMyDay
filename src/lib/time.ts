/**
 * Date/time helpers. All scheduling happens in the user's local wall-clock
 * time: dates are "YYYY-MM-DD" strings and times are minutes since midnight.
 * Date arithmetic on "YYYY-MM-DD" strings goes through UTC so it is immune to
 * the host machine's time zone and DST transitions.
 */

export const MINUTES_PER_DAY = 1440;

function partsInTz(date: Date, timeZone: string) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    // Unknown time zone: fall back to UTC rather than crashing the UI.
    return partsInTz(date, "UTC");
  }
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** Calendar date of an instant in a time zone. */
export function dateInTz(date: Date, timeZone: string): string {
  const p = partsInTz(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight of an instant in a time zone. */
export function minutesInTz(date: Date, timeZone: string): number {
  const p = partsInTz(date, timeZone);
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

export function todayInTz(timeZone: string, now = new Date()): string {
  return dateInTz(now, timeZone);
}

/** Local date of an ISO timestamp in the user's zone. */
export function isoToLocalDate(iso: string, timeZone: string): string {
  return dateInTz(new Date(iso), timeZone);
}

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return parseDate(date).getUTCDay();
}

export function startOfWeek(date: string, weekStartsOn: 0 | 1): string {
  const wd = weekday(date);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(date, -back);
}

export function weekDates(date: string, weekStartsOn: 0 | 1): string[] {
  const start = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "9:30 AM" style label for minutes since midnight. */
export function formatClock(min: number): string {
  const total = ((Math.round(min) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[weekday(date)];
}

export function weekdayLong(date: string): string {
  return WEEKDAY_LONG[weekday(date)];
}

export const WEEKDAY_NAMES = WEEKDAY_SHORT;

/** "Oct 28" */
export function formatShortDate(date: string): string {
  const d = parseDate(date);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Wednesday, October 28" */
export function formatLongDate(date: string): string {
  const d = parseDate(date);
  return `${WEEKDAY_LONG[d.getUTCDay()]}, ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Human label relative to `today`: Today, Tomorrow, Yesterday, Fri, Nov 3. */
export function relativeDayLabel(date: string, today: string): string {
  const d = diffDays(today, date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return weekdayLong(date);
  return formatShortDate(date);
}

export function greetingFor(minutes: number): string {
  if (minutes < 5 * 60) return "Working late";
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** Minutes from (today, nowMin) until a task's deadline. End of day if no time. */
export function minutesUntilDue(
  dueDate: string,
  dueTime: string | null,
  today: string,
  nowMin: number,
): number {
  const dueMin = dueTime ? toMinutes(dueTime) : MINUTES_PER_DAY;
  return diffDays(today, dueDate) * MINUTES_PER_DAY + dueMin - nowMin;
}

export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
