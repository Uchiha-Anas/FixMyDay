import { describe, expect, it } from "vitest";
import { applyMutation, applyMutations } from "./mutations";
import { makeBlock, makeTask } from "./test-utils";
import { emptyAppData, mutationSchema } from "./types";

describe("applyMutation", () => {
  it("upserts and deletes tasks, cascading blocks and dependency references", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b", dependsOn: ["a"] });
    let data = applyMutations(emptyAppData(), [
      { type: "task.upsert", task: a },
      { type: "task.upsert", task: b },
      { type: "block.upsert", block: makeBlock({ id: "blk", kind: "task", taskId: "a" }) },
      { type: "focus.add", session: { id: "f", taskId: "a", startedAt: "2026-10-28T10:00:00Z", endedAt: "2026-10-28T10:25:00Z", plannedMinutes: 25, focusedMinutes: 25, completed: true } },
    ]);
    data = applyMutation(data, { type: "task.upsert", task: { ...a, title: "Renamed" } });
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks[0].title).toBe("Renamed");

    data = applyMutation(data, { type: "task.delete", id: "a" });
    expect(data.tasks.map((t) => t.id)).toEqual(["b"]);
    expect(data.tasks[0].dependsOn).toEqual([]);
    expect(data.blocks).toEqual([]);
    expect(data.focusSessions[0].taskId).toBeNull();
  });

  it("does not duplicate habit logs for the same day", () => {
    const log = { id: "l1", habitId: "h", date: "2026-10-28" };
    const data = applyMutations(emptyAppData(), [
      { type: "habitLog.add", log },
      { type: "habitLog.add", log: { ...log, id: "l2" } },
    ]);
    expect(data.habitLogs).toHaveLength(1);
  });

  it("unlinks tasks when a goal is deleted", () => {
    const data = applyMutations(emptyAppData(), [
      { type: "goal.upsert", goal: { id: "g", title: "Ship v1", description: "", targetDate: null, status: "active", createdAt: "2026-10-01T00:00:00Z" } },
      { type: "task.upsert", task: makeTask({ id: "t", goalId: "g" }) },
      { type: "goal.delete", id: "g" },
    ]);
    expect(data.goals).toEqual([]);
    expect(data.tasks[0].goalId).toBeNull();
  });
});

describe("mutation validation", () => {
  it("rejects malformed payloads", () => {
    expect(mutationSchema.safeParse({ type: "task.upsert", task: { id: "x" } }).success).toBe(false);
    expect(mutationSchema.safeParse({ type: "sql.exec", sql: "drop table tasks" }).success).toBe(false);
    expect(mutationSchema.safeParse({ type: "block.upsert", block: makeBlock({ startMin: 700, endMin: 600 }) }).success).toBe(false);
    expect(mutationSchema.safeParse({ type: "task.upsert", task: makeTask({ dueDate: "28/10/2026" }) }).success).toBe(false);
    expect(mutationSchema.safeParse({ type: "task.upsert", task: makeTask() }).success).toBe(true);
  });
});
