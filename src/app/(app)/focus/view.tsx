"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { Bell, CheckCircle2, Coffee, Maximize2, Minimize2, Pause, Play, RotateCcw, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, NativeSelect, PageHeader, Panel, PanelHeader, StatTile } from "@/components/app/primitives";
import { ProgressRing } from "@/components/app/progress-ring";
import { useAppData } from "@/lib/store";
import { useClock } from "@/hooks/use-clock";
import { addFocusSession, newId, setTaskStatus } from "@/lib/app-actions";
import { elapsedMs, remainingMs, useFocusTimer } from "@/lib/focus-timer";
import { formatClock, formatDuration, isoToLocalDate, minutesInTz, relativeDayLabel } from "@/lib/time";

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [660, 880, 990][i];
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.55);
    });
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {}
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification(title, { body, icon: "/icon.svg" });
    }
  } catch {}
}

export default function FocusPage() {
  return (
    <Suspense>
      <Focus />
    </Suspense>
  );
}

function Focus() {
  const params = useSearchParams();
  const data = useAppData();
  const { today } = useClock();
  const timer = useFocusTimer();
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const [canNotify, setCanNotify] = useState<NotificationPermission | "unsupported">(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const profile = data.profile;

  const openTasks = useMemo(() => data.tasks.filter((t) => t.status !== "done"), [data.tasks]);
  const task = data.tasks.find((t) => t.id === timer.taskId) ?? null;

  // Preselect a task from ?task= and apply the preferred duration when idle.
  useEffect(() => {
    const fromUrl = params.get("task");
    const { status, phase, setTask, setDuration } = useFocusTimer.getState();
    if (status !== "idle" || phase !== "focus") return;
    if (fromUrl && data.tasks.some((t) => t.id === fromUrl)) setTask(fromUrl);
    setDuration(profile.focusMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const complete = useCallback(() => {
    const result = useFocusTimer.getState().finish();
    if (!result) return;
    if (profile.soundEnabled) chime();
    if (result.phase === "focus") {
      const t = data.tasks.find((x) => x.id === result.taskId);
      if (result.focusedMinutes >= 1) {
        addFocusSession(
          {
            id: newId(),
            taskId: result.taskId,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
            plannedMinutes: Math.min(240, result.plannedMinutes),
            focusedMinutes: Math.min(240, result.focusedMinutes),
            completed: true,
          },
          t?.title ?? null,
        );
      }
      const streak = useFocusTimer.getState().streak;
      const long = streak > 0 && streak % 4 === 0;
      const breakMin = long ? profile.longBreakMinutes : profile.shortBreakMinutes;
      useFocusTimer.getState().beginPhase("break", breakMin);
      notify("Focus session complete", `Time for a ${breakMin}-minute break.`);
      toast.success(`Session complete: ${formatDuration(result.focusedMinutes)} focused`, {
        description: profile.breakReminders ? `Take a ${breakMin}-minute ${long ? "long " : ""}break. Step away from the screen.` : undefined,
        duration: 10_000,
      });
    } else {
      useFocusTimer.getState().beginPhase("focus", profile.focusMinutes);
      notify("Break's over", "Ready for another focus session?");
      toast("Break's over", { description: "Ready when you are." });
    }
  }, [data.tasks, profile]);

  // Repaint a few times per second; completion is detected from timestamps.
  useEffect(() => {
    const check = () => {
      const s = useFocusTimer.getState();
      if (s.status === "running" && remainingMs(s) <= 0) complete();
      setNow(Date.now());
    };
    const id = window.setInterval(check, 250);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [complete]);

  const remaining = remainingMs(timer, now);
  const progress = timer.durationMs ? 1 - remaining / timer.durationMs : 0;

  useEffect(() => {
    const original = document.title;
    if (timer.status === "running") document.title = `${mmss(remaining)} · ${timer.phase === "focus" ? "Focus" : "Break"}`;
    return () => {
      document.title = original;
    };
  }, [remaining, timer.status, timer.phase]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function stopEarly() {
    const s = useFocusTimer.getState();
    if (s.phase === "break") {
      s.beginPhase("focus", profile.focusMinutes);
      return;
    }
    const minutes = Math.floor(elapsedMs(s) / 60_000);
    const result = s.finish();
    if (result && minutes >= 1) {
      addFocusSession(
        {
          id: newId(),
          taskId: result.taskId,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          plannedMinutes: Math.min(240, result.plannedMinutes),
          focusedMinutes: Math.min(240, minutes),
          completed: false,
        },
        task?.title ?? null,
      );
      toast(`Logged ${formatDuration(minutes)} of focus`);
    }
    useFocusTimer.getState().setDuration(profile.focusMinutes);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      toast.error("Fullscreen isn't available in this browser.");
    }
  }

  const todaySessions = data.focusSessions
    .filter((s) => isoToLocalDate(s.startedAt, profile.timezone) === today)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const recent = [...data.focusSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);
  const todayMinutes = todaySessions.reduce((s, f) => s + f.focusedMinutes, 0);
  const isBreak = timer.phase === "break";
  const presets = [...new Set([25, profile.focusMinutes, 50, 90])].sort((a, b) => a - b);

  return (
    <div>
      <PageHeader title="Focus" description="One task, one timer. Everything else can wait." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div
          ref={containerRef}
          className={cn(
            "surface-card relative flex flex-col items-center px-6 py-10 text-center",
            fullscreen && "justify-center rounded-none border-0 bg-background",
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Exit distraction-free mode" : "Enter distraction-free mode"}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>

          <p className={cn("eyebrow mb-4", isBreak && "text-success")}>{isBreak ? "Break" : "Focus session"}</p>

          {!isBreak && (
            <div className="mb-6 w-full max-w-md">
              <label htmlFor="focus-task" className="sr-only">Task to focus on</label>
              <NativeSelect
                id="focus-task"
                value={timer.taskId ?? ""}
                disabled={timer.status !== "idle"}
                onChange={(e) => timer.setTask(e.target.value || null)}
                className="h-10 text-center text-base"
              >
                <option value="">Free focus (no task)</option>
                {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </NativeSelect>
              {task?.description && !task.description.startsWith("From your brain dump") && (
                <p className="mt-3 text-sm text-muted-foreground">{task.description}</p>
              )}
            </div>
          )}
          {isBreak && <p className="mb-6 max-w-sm text-sm text-muted-foreground">Stand up, stretch, look at something far away. Your next session will be ready when you are.</p>}

          <ProgressRing value={progress} size={fullscreen ? 340 : 260} stroke={10} label={`${isBreak ? "Break" : "Focus"} progress`}>
            <div>
              <p className={cn("font-mono text-6xl font-light tabular-nums", fullscreen && "text-7xl")} aria-live="off">{mmss(remaining)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {timer.status === "running" ? `Ends at ${formatClock(minutesInTz(new Date(now + remaining), profile.timezone))}` : timer.status === "paused" ? "Paused" : `${Math.round(timer.durationMs / 60000)} min`}
              </p>
            </div>
          </ProgressRing>

          {timer.status === "idle" && !isBreak && (
            <div className="mt-6 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Session length">
              {presets.map((m) => (
                <Button key={m} size="sm" variant={Math.round(timer.durationMs / 60000) === m ? "secondary" : "ghost"} onClick={() => timer.setDuration(m)}>
                  {m} min
                </Button>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {timer.status === "running" ? (
              <Button size="lg" variant="secondary" onClick={timer.pause} className="min-w-32">
                <Pause /> Pause
              </Button>
            ) : (
              <Button size="lg" onClick={timer.start} className="min-w-32">
                <Play /> {timer.status === "paused" ? "Resume" : isBreak ? "Start break" : "Start"}
              </Button>
            )}
            {timer.status !== "idle" && (
              <>
                <Button size="lg" variant="outline" onClick={stopEarly}>
                  <Square /> {isBreak ? "Skip break" : "Finish now"}
                </Button>
                <Button size="lg" variant="ghost" onClick={timer.reset} aria-label="Reset timer without saving">
                  <RotateCcw /> Reset
                </Button>
              </>
            )}
            {timer.status === "idle" && isBreak && (
              <Button size="lg" variant="ghost" onClick={() => timer.beginPhase("focus", profile.focusMinutes)}>
                Skip break
              </Button>
            )}
          </div>

          {task && task.status !== "done" && (
            <Button
              variant="link"
              className="mt-4"
              onClick={() => {
                setTaskStatus(task.id, "done");
                toast.success("Task completed", { description: task.title });
              }}
            >
              <CheckCircle2 /> Mark “{task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}” complete
            </Button>
          )}

          {canNotify === "default" && profile.breakReminders && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-muted-foreground"
              onClick={() => void Notification.requestPermission().then(setCanNotify)}
            >
              <Bell /> Notify me when a session ends
            </Button>
          )}
        </div>

        <div className="space-y-6">
          <Panel>
            <PanelHeader icon={Timer} title="Today" />
            <div className="grid grid-cols-2 gap-3 p-5 pt-4">
              <StatTile label="Focused" value={formatDuration(todayMinutes)} />
              <StatTile label="Sessions" value={todaySessions.length} />
            </div>
          </Panel>
          <Panel>
            <PanelHeader icon={Coffee} title="Recent sessions" />
            <div className="p-2 pb-3">
              {recent.length === 0 ? (
                <EmptyState icon={Timer} title="No sessions yet" description="Completed focus sessions are recorded here." />
              ) : (
                <ul>
                  {recent.map((s) => {
                    const t = data.tasks.find((x) => x.id === s.taskId);
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate">{t?.title ?? "Free focus"}</span>
                          <span className="text-xs text-muted-foreground">
                            {relativeDayLabel(isoToLocalDate(s.startedAt, profile.timezone), today)} ·{" "}
                            {formatClock(minutesInTz(new Date(s.startedAt), profile.timezone))}
                          </span>
                        </span>
                        <span className={cn("shrink-0 text-xs tabular-nums", s.completed ? "text-success" : "text-muted-foreground")}>
                          {formatDuration(s.focusedMinutes)}
                          {!s.completed && " (stopped)"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
