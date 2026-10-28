import { describe, expect, it } from "vitest";
import { recommendNext } from "./recommend";
import { makeBlock, makeTask } from "./test-utils";

const today = "2026-10-28";
const profile = { workStart: "09:00", workEnd: "18:00" };

describe("recommendNext", () => {
  it("returns nothing when there are no open tasks", () => {
    expect(recommendNext({ tasks: [makeTask({ status: "done" })], blocks: [], today, nowMin: 600, profile })).toEqual([]);
  });

  it("prefers overdue and due-today tasks over undated ones", () => {
    const later = makeTask({ id: "later", priority: "high" });
    const overdue = makeTask({ id: "overdue", priority: "low", dueDate: "2026-10-26" });
    const recs = recommendNext({ tasks: [later, overdue], blocks: [], today, nowMin: 600, profile });
    expect(recs[0].task.id).toBe("overdue");
    expect(recs[0].reasons).toContain("Overdue");
  });

  it("puts the task scheduled right now first", () => {
    const planned = makeTask({ id: "planned", priority: "low" });
    const other = makeTask({ id: "other", priority: "high" });
    const block = makeBlock({ kind: "task", taskId: "planned", date: today, startMin: 590, endMin: 650 });
    const recs = recommendNext({ tasks: [other, planned], blocks: [block], today, nowMin: 600, profile });
    expect(recs[0].task.id).toBe("planned");
    expect(recs[0].block?.id).toBe(block.id);
    expect(recs[0].reasons[0]).toMatch(/Scheduled right now/);
  });

  it("excludes tasks whose dependencies are still open", () => {
    const dep = makeTask({ id: "dep" });
    const blocked = makeTask({ id: "blocked", priority: "urgent", dependsOn: ["dep"] });
    const recs = recommendNext({ tasks: [dep, blocked], blocks: [], today, nowMin: 600, profile });
    expect(recs.map((r) => r.task.id)).toEqual(["dep"]);
    expect(recs[0].reasons.join(" ")).toMatch(/Unblocks 1 other task/);
  });

  it("flags tight deadlines", () => {
    const tight = makeTask({ id: "tight", dueDate: today, dueTime: "11:00", estimatedMinutes: 45 });
    const recs = recommendNext({ tasks: [tight, makeTask({ priority: "urgent" })], blocks: [], today, nowMin: 600, profile });
    expect(recs[0].task.id).toBe("tight");
    expect(recs[0].reasons.join(" ")).toMatch(/slack/);
  });

  it("is deterministic and always gives at least one reason", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b", estimatedMinutes: 10 })];
    const r1 = recommendNext({ tasks, blocks: [], today, nowMin: 600, profile });
    const r2 = recommendNext({ tasks, blocks: [], today, nowMin: 600, profile });
    expect(r1).toEqual(r2);
    expect(r1.every((r) => r.reasons.length > 0)).toBe(true);
    expect(r1[0].task.id).toBe("b"); // quick win
  });
});
