import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type FocusPhase = "focus" | "break";
export type TimerStatus = "idle" | "running" | "paused";

export interface TimerSnapshot {
  phase: FocusPhase;
  status: TimerStatus;
  durationMs: number;
  /** Epoch ms when the current running segment began; null unless running. */
  segmentStartedAt: number | null;
  /** Time accumulated in previous running segments. */
  accumulatedMs: number;
  /** ISO time the session first started (for the session record). */
  sessionStartedAt: string | null;
}

/**
 * Elapsed time is derived from wall-clock timestamps, never from counting
 * ticks, so it stays correct when the tab is throttled, hidden or reloaded.
 */
export function elapsedMs(s: Pick<TimerSnapshot, "status" | "segmentStartedAt" | "accumulatedMs">, now = Date.now()): number {
  const running = s.status === "running" && s.segmentStartedAt !== null ? Math.max(0, now - s.segmentStartedAt) : 0;
  return s.accumulatedMs + running;
}

export function remainingMs(s: TimerSnapshot, now = Date.now()): number {
  return Math.max(0, s.durationMs - elapsedMs(s, now));
}

export const timerTransitions = {
  start(s: TimerSnapshot, now: number): TimerSnapshot {
    if (s.status === "running") return s;
    return {
      ...s,
      status: "running",
      segmentStartedAt: now,
      sessionStartedAt: s.sessionStartedAt ?? new Date(now).toISOString(),
    };
  },
  pause(s: TimerSnapshot, now: number): TimerSnapshot {
    if (s.status !== "running") return s;
    return { ...s, status: "paused", accumulatedMs: elapsedMs(s, now), segmentStartedAt: null };
  },
  reset(s: TimerSnapshot): TimerSnapshot {
    return { ...s, status: "idle", accumulatedMs: 0, segmentStartedAt: null, sessionStartedAt: null };
  },
  setDuration(s: TimerSnapshot, minutes: number): TimerSnapshot {
    if (s.status !== "idle") return s;
    return { ...s, durationMs: Math.round(minutes * 60_000) };
  },
};

interface FocusTimerState extends TimerSnapshot {
  taskId: string | null;
  /** Focus sessions completed in a row; every fourth earns a long break. */
  streak: number;
  setTask: (taskId: string | null) => void;
  setDuration: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Ends the current phase and returns what happened, or null if nothing was running. */
  finish: () => { phase: FocusPhase; startedAt: string; endedAt: string; plannedMinutes: number; focusedMinutes: number; taskId: string | null } | null;
  beginPhase: (phase: FocusPhase, minutes: number) => void;
}

export const useFocusTimer = create<FocusTimerState>()(
  persist(
    (set, get) => ({
      phase: "focus",
      status: "idle",
      durationMs: 50 * 60_000,
      segmentStartedAt: null,
      accumulatedMs: 0,
      sessionStartedAt: null,
      taskId: null,
      streak: 0,
      setTask: (taskId) => set({ taskId }),
      setDuration: (minutes) => set((s) => timerTransitions.setDuration(s, minutes)),
      start: () => set((s) => timerTransitions.start(s, Date.now())),
      pause: () => set((s) => timerTransitions.pause(s, Date.now())),
      reset: () => set((s) => timerTransitions.reset(s)),
      finish: () => {
        const s = get();
        if (s.status === "idle" || !s.sessionStartedAt) return null;
        const now = Date.now();
        const elapsed = Math.min(elapsedMs(s, now), s.durationMs);
        const result = {
          phase: s.phase,
          startedAt: s.sessionStartedAt,
          endedAt: new Date(now).toISOString(),
          plannedMinutes: Math.max(1, Math.round(s.durationMs / 60_000)),
          focusedMinutes: Math.round(elapsed / 60_000),
          taskId: s.taskId,
        };
        // Reset synchronously so a second tick can never record the same session twice.
        set({ ...timerTransitions.reset(s), streak: s.phase === "focus" && elapsed >= s.durationMs ? s.streak + 1 : s.streak });
        return result;
      },
      beginPhase: (phase, minutes) =>
        set((s) => ({ ...timerTransitions.reset(s), phase, durationMs: Math.round(minutes * 60_000) })),
    }),
    {
      name: "fixmyday.focus-timer",
      // window is undefined during prerender; zustand then skips persistence.
      storage: createJSONStorage(() => window.localStorage),
    },
  ),
);
