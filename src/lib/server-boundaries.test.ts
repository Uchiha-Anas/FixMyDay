import { describe, expect, it } from "vitest";
import { fromRow, mutationToOp, toRow } from "./supabase/mapping";
import { safeNextPath, isProtectedPath } from "./supabase/config";
import { createRateLimiter } from "./ai/rate-limit";
import { buildSampleData } from "./seed";
import { makeTask } from "./test-utils";
import { DEFAULT_PROFILE, appDataSchema, mutationBatchSchema, taskSchema } from "./types";
import { findConflicts } from "./scheduler";

describe("authorization boundary: DB mapping", () => {
  it("always stamps the session user id, ignoring anything in the payload", () => {
    const forged = { ...makeTask(), userId: "attacker" } as unknown as Record<string, unknown>;
    const row = toRow(forged, "session-user");
    expect(row.user_id).toBe("session-user");
    const op = mutationToOp({ type: "task.upsert", task: makeTask() }, "session-user");
    expect(op.kind === "upsert" && op.row.user_id).toBe("session-user");
  });

  it("scopes profile updates to the session user's own row", () => {
    const op = mutationToOp({ type: "profile.update", profile: DEFAULT_PROFILE }, "u1");
    expect(op).toMatchObject({ kind: "profile", row: { id: "u1" } });
  });

  it("drops extra fields like user_id when mapping rows back", () => {
    const task = makeTask({ dueDate: "2026-10-30", dueTime: "09:30" });
    const row = { ...toRow(task, "u1"), due_time: "09:30:00" };
    const back = fromRow(row, taskSchema);
    expect(back).toEqual(task);
    expect(back && "userId" in back).toBe(false);
  });

  it("returns null for corrupted rows instead of crashing", () => {
    expect(fromRow({ id: "x", title: "" }, taskSchema)).toBeNull();
  });

  it("rejects oversized or unknown mutation batches", () => {
    expect(mutationBatchSchema.safeParse([]).success).toBe(false);
    const many = Array.from({ length: 201 }, () => ({ type: "task.delete", id: "x" }));
    expect(mutationBatchSchema.safeParse(many).success).toBe(false);
    expect(mutationBatchSchema.safeParse([{ type: "task.delete", id: "x", extra: "ignored" }]).success).toBe(true);
  });
});

describe("routing guards", () => {
  it("only allows same-site relative redirects", () => {
    expect(safeNextPath("/planner")).toBe("/planner");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });

  it("protects app routes but not public ones", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/tasks/123")).toBe(true);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/dashboarding")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window and reports retry time", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 100).ok).toBe(true);
    const third = rl.check("a", 200);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfterSec).toBe(1);
    expect(rl.check("b", 200).ok).toBe(true);
    expect(rl.check("a", 1001).ok).toBe(true);
  });
});

describe("sample data", () => {
  it("is valid, internally consistent and conflict-free", () => {
    let i = 0;
    const data = buildSampleData(
      { ...DEFAULT_PROFILE, timezone: "UTC", onboarded: true },
      new Date("2026-10-28T08:00:00Z"),
      () => `00000000-0000-4000-8000-${String(++i).padStart(12, "0")}`,
    );
    expect(appDataSchema.safeParse(data).success).toBe(true);
    const ids = new Set(data.tasks.map((t) => t.id));
    for (const t of data.tasks) for (const d of t.dependsOn) expect(ids.has(d)).toBe(true);
    expect(findConflicts(data.blocks)).toEqual([]);
    expect(data.blocks.some((b) => b.kind === "task")).toBe(true);
  });
});
