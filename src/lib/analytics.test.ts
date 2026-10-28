import { describe, expect, it } from "vitest";
import { activeDayStreak, dailyStats, habitStreak, habitWeek, todaysTasks, weeklyStats, isOverdue, goalProgress } from "./analytics";
import { makeBlock, makeTask } from "./test-utils";
import { emptyAppData } from "./types";

const today = "2026-10-28";

function data() {
  const d = emptyAppData({ timezone: "UTC" });
  d.tasks = [
    makeTask({ id: "a", status: "done", completedAt: "2026-10-28T10:00:00Z", createdAt: "2026-10-27T08:00:00Z", dueDate: "2026-10-28" }),
    makeTask({ id: "b", status: "done", completedAt: "2026-10-27T10:00:00Z", createdAt: "2026-10-26T08:00:00Z", dueDate: "2026-10-26" }),
    makeTask({ id: "c", dueDate: "2026-10-26", createdAt: "2026-10-20T08:00:00Z" }),
    makeTask({ id: "d", createdAt: "2026-10-28T08:00:00Z" }),
  ];
  d.focusSessions = [
    { id: "f", taskId: "a", startedAt: "2026-10-28T09:00:00Z", endedAt: "2026-10-28T09:50:00Z", plannedMinutes: 50, focusedMinutes: 50, completed: true },
  ];
  d.blocks = [makeBlock({ kind: "task", taskId: "d", date: today })];
  return d;
}

describe("analytics", () => {
  it("handles an empty dataset", () => {
    const stats = dailyStats(emptyAppData(), today, 7);
    expect(stats).toHaveLength(7);
    expect(stats.every((s) => s.completed === 0 && s.focusMinutes === 0)).toBe(true);
    expect(weeklyStats(emptyAppData(), today, 4).every((w) => w.rate === null)).toBe(true);
    expect(activeDayStreak(emptyAppData(), today)).toBe(0);
  });

  it("counts completions, focus, deadlines and overdue per day", () => {
    const stats = dailyStats(data(), today, 3);
    const byDate = Object.fromEntries(stats.map((s) => [s.date, s]));
    expect(byDate["2026-10-28"]).toMatchObject({ completed: 1, focusMinutes: 50, due: 1, dueDone: 1, created: 1 });
    expect(byDate["2026-10-26"]).toMatchObject({ due: 2, dueDone: 0 });
    // On the 27th, b (due 26th, done 27th) and c were overdue at end of day; on the 28th only c.
    expect(byDate["2026-10-27"].overdueOpen).toBe(1);
    expect(byDate["2026-10-28"].overdueOpen).toBe(1);
  });

  it("computes the active streak", () => {
    expect(activeDayStreak(data(), today)).toBe(2);
  });

  it("selects today's relevant tasks", () => {
    expect(todaysTasks(data(), today).map((t) => t.id).sort()).toEqual(["a", "c", "d"]);
  });

  it("detects overdue tasks including same-day times", () => {
    expect(isOverdue(makeTask({ dueDate: today, dueTime: "09:00" }), today, 600)).toBe(true);
    expect(isOverdue(makeTask({ dueDate: today, dueTime: "11:00" }), today, 600)).toBe(false);
    expect(isOverdue(makeTask({ dueDate: "2026-10-27", status: "done" }), today, 600)).toBe(false);
  });

  it("tracks goal progress", () => {
    const tasks = [makeTask({ goalId: "g", status: "done" }), makeTask({ goalId: "g" }), makeTask()];
    expect(goalProgress("g", tasks)).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(goalProgress("none", tasks).ratio).toBe(0);
  });
});

describe("habits", () => {
  const logs = ["2026-10-25", "2026-10-26", "2026-10-27"].map((date, i) => ({ id: `l${i}`, habitId: "h", date }));

  it("does not break the streak before today is over", () => {
    expect(habitStreak("h", logs, today)).toBe(3);
    expect(habitStreak("h", [...logs, { id: "x", habitId: "h", date: today }], today)).toBe(4);
    expect(habitStreak("h", logs, "2026-10-30")).toBe(0);
  });

  it("reports weekly progress", () => {
    const habit = { id: "h", title: "Read", targetPerWeek: 5, archived: false, createdAt: "2026-10-01T00:00:00Z" };
    const week = habitWeek(habit, logs, today, 1); // week starts Monday Oct 26
    expect(week.done).toBe(2);
    expect(week.days[0].date).toBe("2026-10-26");
    expect(week.days[6].future).toBe(true);
  });
});
