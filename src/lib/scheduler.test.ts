import { describe, expect, it } from "vitest";
import { findConflicts, findFreeSlot, freeIntervals, planDay, swapBlocks, validatePlacement, type PlanProfile } from "./scheduler";
import { makeBlock, makeTask } from "./test-utils";
import type { ScheduleBlock } from "./types";

const DATE = "2026-10-28"; // a Wednesday
const profile: PlanProfile = {
  workStart: "09:00",
  workEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
  bufferMinutes: 0,
  breakAfterMinutes: 90,
  shortBreakMinutes: 10,
};

let idn = 0;
const newId = () => `p${++idn}`;

function noOverlaps(blocks: ScheduleBlock[]) {
  expect(findConflicts(blocks)).toEqual([]);
}

describe("planDay", () => {
  it("schedules tasks inside working hours without overlaps", () => {
    const tasks = [makeTask({ estimatedMinutes: 60 }), makeTask({ estimatedMinutes: 45 }), makeTask({ estimatedMinutes: 30 })];
    const res = planDay({ date: DATE, nowMin: null, profile, tasks, fixedBlocks: [], newId });
    const taskBlocks = res.blocks.filter((b) => b.kind === "task");
    expect(taskBlocks).toHaveLength(3);
    for (const b of res.blocks) {
      expect(b.startMin).toBeGreaterThanOrEqual(9 * 60);
      expect(b.endMin).toBeLessThanOrEqual(17 * 60);
    }
    noOverlaps(res.blocks);
    expect(res.unscheduled).toEqual([]);
    expect(res.stats.overloaded).toBe(false);
  });

  it("works around fixed events and never overlaps them", () => {
    const event = makeBlock({ startMin: 600, endMin: 720, title: "Workshop" });
    const tasks = [makeTask({ estimatedMinutes: 50 }), makeTask({ estimatedMinutes: 50 }), makeTask({ estimatedMinutes: 50 })];
    const res = planDay({ date: DATE, nowMin: null, profile, tasks, fixedBlocks: [event], newId });
    noOverlaps([...res.blocks, event]);
    // First task fits 9:00-9:50; the next 50-min task can't fit in 9:50-10:00, so it goes after the event.
    expect(res.blocks[0]).toMatchObject({ startMin: 540, endMin: 590 });
    expect(res.blocks.filter((b) => b.kind === "task").every((b) => b.endMin <= 600 || b.startMin >= 720)).toBe(true);
  });

  it("orders by priority and deadline urgency and explains why", () => {
    const low = makeTask({ id: "low", priority: "low" });
    const dueToday = makeTask({ id: "due", priority: "medium", dueDate: DATE });
    const urgent = makeTask({ id: "urgent", priority: "urgent" });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [low, dueToday, urgent], fixedBlocks: [], newId });
    expect(res.blocks.map((b) => b.taskId)).toEqual(["due", "urgent", "low"]);
    expect(res.reasons.due).toContain("Due today");
    expect(res.reasons.urgent).toContain("Urgent priority");
  });

  it("flags overload honestly instead of squeezing tasks in", () => {
    const tasks = [
      makeTask({ id: "a", estimatedMinutes: 240, dueDate: DATE }),
      makeTask({ id: "b", estimatedMinutes: 240, dueDate: DATE }),
      makeTask({ id: "c", estimatedMinutes: 120, dueDate: DATE }),
    ];
    const res = planDay({ date: DATE, nowMin: null, profile, tasks, fixedBlocks: [], newId });
    noOverlaps(res.blocks);
    expect(res.stats.overloaded).toBe(true);
    expect(res.stats.overloadMinutes).toBeGreaterThan(0);
    expect(res.unscheduled.length).toBeGreaterThan(0);
    expect(res.unscheduled.every((u) => u.mustDo)).toBe(true);
    const planned = res.blocks.filter((b) => b.kind === "task").reduce((s, b) => s + b.endMin - b.startMin, 0);
    expect(planned).toBeLessThanOrEqual(res.stats.availableMinutes);
  });

  it("does not count unfinished non-urgent work as overload", () => {
    const tasks = [makeTask({ estimatedMinutes: 600 })];
    const res = planDay({ date: DATE, nowMin: null, profile, tasks, fixedBlocks: [], newId });
    expect(res.stats.overloaded).toBe(false);
    expect(res.unscheduled[0].reason).toMatch(/fits today/);
  });

  it("splits long tasks into chunks with breaks between sustained work", () => {
    const tasks = [makeTask({ id: "big", estimatedMinutes: 200 })];
    const res = planDay({ date: DATE, nowMin: null, profile, tasks, fixedBlocks: [], newId });
    const chunks = res.blocks.filter((b) => b.taskId === "big");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((s, b) => s + b.endMin - b.startMin, 0)).toBe(200);
    expect(res.blocks.some((b) => b.kind === "break")).toBe(true);
    expect(chunks.every((b) => b.endMin - b.startMin <= 90)).toBe(true);
    noOverlaps(res.blocks);
  });

  it("respects dependencies: a task starts only after its prerequisite ends", () => {
    const first = makeTask({ id: "first", priority: "low", estimatedMinutes: 30 });
    const second = makeTask({ id: "second", priority: "urgent", estimatedMinutes: 30, dependsOn: ["first"] });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [second, first], fixedBlocks: [], newId });
    const a = res.blocks.find((b) => b.taskId === "first")!;
    const b = res.blocks.find((b) => b.taskId === "second")!;
    expect(b.startMin).toBeGreaterThanOrEqual(a.endMin);
  });

  it("reports tasks blocked by an unschedulable prerequisite", () => {
    const first = makeTask({ id: "first", estimatedMinutes: 60, preferredTime: "evening" });
    const second = makeTask({ id: "second", dependsOn: ["first"] });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [first, second], fixedBlocks: [], newId });
    expect(res.blocks).toHaveLength(0);
    expect(res.unscheduled.find((u) => u.taskId === "first")!.reason).toMatch(/evening/);
    expect(res.unscheduled.find((u) => u.taskId === "second")!.reason).toMatch(/Waiting on/);
  });

  it("ignores completed prerequisites and completed tasks", () => {
    const done = makeTask({ id: "done", status: "done" });
    const next = makeTask({ id: "next", dependsOn: ["done"] });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [done, next], fixedBlocks: [], newId });
    expect(res.blocks.map((b) => b.taskId)).toEqual(["next"]);
  });

  it("starts from the current time when planning today", () => {
    const res = planDay({ date: DATE, nowMin: 13 * 60 + 7, profile, tasks: [makeTask()], fixedBlocks: [], newId });
    expect(res.blocks[0].startMin).toBe(13 * 60 + 10);
    expect(res.stats.availableMinutes).toBe(17 * 60 - (13 * 60 + 10));
  });

  it("schedules nothing after working hours end", () => {
    const res = planDay({ date: DATE, nowMin: 18 * 60, profile, tasks: [makeTask()], fixedBlocks: [], newId });
    expect(res.blocks).toEqual([]);
    expect(res.stats.availableMinutes).toBe(0);
    expect(res.unscheduled[0].reason).toMatch(/No free time/);
  });

  it("honours preferred time windows", () => {
    const evening = makeTask({ id: "eve", preferredTime: "afternoon", priority: "urgent" });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [evening, makeTask({ id: "any" })], fixedBlocks: [], newId });
    expect(res.blocks.find((b) => b.taskId === "eve")!.startMin).toBeGreaterThanOrEqual(12 * 60);
    expect(res.blocks.find((b) => b.taskId === "any")!.startMin).toBe(9 * 60);
  });

  it("does not schedule a task past its same-day deadline", () => {
    const busy = makeBlock({ startMin: 540, endMin: 660 });
    const t = makeTask({ id: "late", estimatedMinutes: 60, dueDate: DATE, dueTime: "11:30" });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [t], fixedBlocks: [busy], newId });
    expect(res.blocks.filter((b) => b.taskId === "late")).toHaveLength(0);
    const u = res.unscheduled.find((x) => x.taskId === "late")!;
    expect(u.reason).toMatch(/deadline/);
    expect(u.mustDo).toBe(true);
  });

  it("schedules a time-bound task before its deadline when possible", () => {
    const t = makeTask({ id: "x", estimatedMinutes: 60, dueDate: DATE, dueTime: "12:00", priority: "low" });
    const others = [makeTask({ priority: "urgent", estimatedMinutes: 120 })];
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [...others, t], fixedBlocks: [], newId });
    expect(res.blocks.find((b) => b.taskId === "x")!.endMin).toBeLessThanOrEqual(12 * 60);
  });

  it("returns nothing on a non-working day unless forced", () => {
    const saturday = "2026-10-31";
    const res = planDay({ date: saturday, nowMin: null, profile, tasks: [makeTask()], fixedBlocks: [], newId });
    expect(res.blocks).toEqual([]);
    expect(res.unscheduled[0].reason).toMatch(/Saturday/);
    const forced = planDay({ date: saturday, nowMin: null, profile, tasks: [makeTask()], fixedBlocks: [], newId, ignoreWorkDays: true });
    expect(forced.blocks).toHaveLength(1);
  });

  it("counts time already covered by locked blocks", () => {
    const t = makeTask({ id: "t", estimatedMinutes: 60 });
    const locked = makeBlock({ kind: "task", taskId: "t", startMin: 540, endMin: 570 });
    const res = planDay({ date: DATE, nowMin: null, profile, tasks: [t], fixedBlocks: [locked], newId });
    const planned = res.blocks.filter((b) => b.taskId === "t");
    expect(planned.reduce((s, b) => s + b.endMin - b.startMin, 0)).toBe(30);
    noOverlaps([...res.blocks, locked]);
  });

  it("adds buffer time between tasks", () => {
    const res = planDay({
      date: DATE, nowMin: null, profile: { ...profile, bufferMinutes: 10 },
      tasks: [makeTask({ id: "a" }), makeTask({ id: "b" })], fixedBlocks: [], newId,
    });
    expect(res.blocks[1].startMin - res.blocks[0].endMin).toBe(10);
  });

  it("is deterministic", () => {
    const tasks = [makeTask({ id: "a", estimatedMinutes: 100 }), makeTask({ id: "b", dueDate: DATE }), makeTask({ id: "c" })];
    let i = 0;
    const ids = () => `x${i++}`;
    const r1 = planDay({ date: DATE, nowMin: 600, profile, tasks, fixedBlocks: [], newId: ids });
    i = 0;
    const r2 = planDay({ date: DATE, nowMin: 600, profile, tasks, fixedBlocks: [], newId: ids });
    expect(r1).toEqual(r2);
  });
});

describe("conflict helpers", () => {
  it("finds overlapping pairs only on the same day", () => {
    const a = makeBlock({ id: "a", startMin: 600, endMin: 660 });
    const b = makeBlock({ id: "b", startMin: 630, endMin: 700 });
    const c = makeBlock({ id: "c", startMin: 660, endMin: 700, date: "2026-10-29" });
    const d = makeBlock({ id: "d", startMin: 660, endMin: 690 });
    const pairs = findConflicts([a, b, c, d]).map(([x, y]) => [x.id, y.id].sort().join("-"));
    expect(pairs.sort()).toEqual(["a-b", "b-d"]);
  });

  it("validates manual placement against availability and overlaps", () => {
    const other = makeBlock({ id: "o", startMin: 600, endMin: 660, title: "Standup" });
    const task = makeBlock({ id: "t", kind: "task", startMin: 630, endMin: 690 });
    expect(validatePlacement(task, [other], profile)).toMatch(/Overlaps “Standup”/);
    expect(validatePlacement({ ...task, startMin: 480, endMin: 510 }, [other], profile)).toMatch(/working hours/);
    expect(validatePlacement({ ...task, startMin: 660, endMin: 690 }, [other], profile)).toBeNull();
    // Events may sit outside working hours.
    expect(validatePlacement({ ...task, kind: "event", startMin: 1200, endMin: 1260 }, [other], profile)).toBeNull();
  });

  it("swaps adjacent blocks keeping the span", () => {
    const a = makeBlock({ id: "a", kind: "task", locked: false, startMin: 540, endMin: 600 });
    const b = makeBlock({ id: "b", kind: "task", locked: false, startMin: 610, endMin: 640 });
    const res = swapBlocks(a, b, [a, b]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.blocks[0]).toMatchObject({ id: "b", startMin: 540, endMin: 570 });
      expect(res.blocks[1]).toMatchObject({ id: "a", startMin: 580, endMin: 640 });
    }
    expect(swapBlocks({ ...a, locked: true }, b, [a, b]).ok).toBe(false);
  });

  it("computes free intervals and slots", () => {
    const blocks = [makeBlock({ startMin: 600, endMin: 660 }), makeBlock({ startMin: 650, endMin: 700 })];
    expect(freeIntervals(blocks, 540, 780)).toEqual([[540, 600], [700, 780]]);
    expect(findFreeSlot(90, blocks, DATE, profile)).toBe(700);
    expect(findFreeSlot(30, blocks, DATE, profile, 545)).toBe(545);
  });
});
