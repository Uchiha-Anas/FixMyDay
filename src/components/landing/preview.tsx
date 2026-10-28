import { ArrowRight, Check, Compass, Sparkles } from "lucide-react";
import { cn } from "cn";

const TASKS = [
  { title: "Prepare for the exam", meta: "Study · 2h · due tomorrow", priority: "High", tone: "warning" },
  { title: "Finish my portfolio website", meta: "Work · 2h · no deadline", priority: "Medium", tone: "info" },
  { title: "Go to the gym", meta: "Health · 1h", priority: "Medium", tone: "info" },
  { title: "Call my friend", meta: "Social · 20m · tonight", priority: "Medium", tone: "info" },
];

const PLAN = [
  { time: "9:00", end: "10:30", title: "Prepare for the exam", kind: "task", state: "done" },
  { time: "10:30", end: "10:45", title: "Break", kind: "break" },
  { time: "10:45", end: "11:15", title: "Prepare for the exam", kind: "task", state: "now" },
  { time: "12:30", end: "13:30", title: "Lunch with Sam", kind: "event" },
  { time: "13:30", end: "15:00", title: "Finish my portfolio website", kind: "task" },
  { time: "17:00", end: "18:00", title: "Go to the gym", kind: "task" },
  { time: "18:05", end: "18:25", title: "Call my friend", kind: "task" },
];

/** A static, faithful rendering of the real app UI, used on the landing page. */
export function LandingPreview() {
  return (
    <div className="surface-card overflow-hidden p-0 text-left" aria-label="Product preview">
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-3 text-xs text-muted-foreground">fixmyday · Today</span>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-5 md:p-5">
        <div className="space-y-4 md:col-span-3">
          <div className="rounded-xl border bg-background/60">
            <p className="px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              I have an exam tomorrow, need to finish my portfolio website, go to the gym for an hour, and call my friend tonight.
            </p>
            <div className="flex items-center justify-end border-t px-3 py-2">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground">
                <Sparkles className="size-3.5" /> Fix my day
              </span>
            </div>
          </div>
          <div className="rounded-xl border bg-surface/50 p-3">
            <p className="eyebrow mb-2 flex items-center gap-1.5">
              <ArrowRight className="size-3" /> 4 tasks found · review before saving
            </p>
            <ul className="space-y-1.5">
              {TASKS.map((t) => (
                <li key={t.title} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                  <span className="grid size-4 place-items-center rounded-[4px] bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t.meta}</span>
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset",
                      t.tone === "warning" ? "bg-warning/12 text-warning ring-warning/25" : "bg-info/10 text-info ring-info/20",
                    )}
                  >
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-xl border bg-primary/5 p-3">
            <p className="eyebrow mb-1 flex items-center gap-1.5 text-primary">
              <Compass className="size-3" /> Do this next
            </p>
            <p className="text-sm font-medium">Prepare for the exam</p>
            <p className="mt-1 text-xs text-muted-foreground">Due tomorrow · Scheduled right now (until 11:15 AM)</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="eyebrow mb-2">Today&apos;s plan</p>
            <ol className="space-y-1">
              {PLAN.map((b, i) => (
                <li key={i} className="flex items-center gap-2.5 text-xs">
                  <span className="w-10 shrink-0 text-muted-foreground tabular-nums">{b.time}</span>
                  <span
                    className={cn(
                      "h-6 w-1 rounded-full",
                      b.kind === "event" ? "bg-info" : b.kind === "break" ? "bg-muted-foreground/30" : b.state === "done" ? "bg-success" : b.state === "now" ? "bg-primary" : "bg-primary/40",
                    )}
                  />
                  <span className={cn("truncate", b.state === "done" && "text-muted-foreground line-through", b.kind === "break" && "text-muted-foreground")}>
                    {b.title}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
