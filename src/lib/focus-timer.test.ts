import { describe, expect, it } from "vitest";
import { elapsedMs, remainingMs, timerTransitions, type TimerSnapshot } from "./focus-timer";

const base: TimerSnapshot = {
  phase: "focus",
  status: "idle",
  durationMs: 25 * 60_000,
  segmentStartedAt: null,
  accumulatedMs: 0,
  sessionStartedAt: null,
};

describe("focus timer math", () => {
  it("measures elapsed time from timestamps, not ticks", () => {
    const t0 = 1_000_000;
    const running = timerTransitions.start(base, t0);
    // Even if no tick happened for 10 minutes (background tab), elapsed is exact.
    expect(elapsedMs(running, t0 + 10 * 60_000)).toBe(10 * 60_000);
    expect(remainingMs(running, t0 + 10 * 60_000)).toBe(15 * 60_000);
  });

  it("pauses and resumes without losing or gaining time", () => {
    const t0 = 0;
    let s = timerTransitions.start(base, t0);
    s = timerTransitions.pause(s, t0 + 5 * 60_000);
    expect(s.accumulatedMs).toBe(5 * 60_000);
    // Time spent paused does not count.
    expect(elapsedMs(s, t0 + 60 * 60_000)).toBe(5 * 60_000);
    s = timerTransitions.start(s, t0 + 60 * 60_000);
    expect(elapsedMs(s, t0 + 62 * 60_000)).toBe(7 * 60_000);
    expect(s.sessionStartedAt).toBe(new Date(t0).toISOString());
  });

  it("never reports negative remaining time", () => {
    const s = timerTransitions.start(base, 0);
    expect(remainingMs(s, 99 * 60_000)).toBe(0);
  });

  it("ignores duration changes while running and resets cleanly", () => {
    const s = timerTransitions.start(base, 0);
    expect(timerTransitions.setDuration(s, 90).durationMs).toBe(base.durationMs);
    const r = timerTransitions.reset(s);
    expect(r).toMatchObject({ status: "idle", accumulatedMs: 0, segmentStartedAt: null, sessionStartedAt: null });
    expect(timerTransitions.setDuration(r, 50).durationMs).toBe(50 * 60_000);
  });

  it("start and pause are idempotent", () => {
    const s = timerTransitions.start(base, 0);
    expect(timerTransitions.start(s, 5000)).toBe(s);
    expect(timerTransitions.pause(base, 5000)).toBe(base);
  });
});
