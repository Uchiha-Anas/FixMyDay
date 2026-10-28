"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { AlertCircle, ArrowRight, Brain, CalendarRange, Check, HelpCircle, Loader2, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, NativeSelect } from "./primitives";
import { useUI } from "@/lib/ui-store";
import { useClock } from "@/hooks/use-clock";
import { buildTask, createTasks } from "@/lib/app-actions";
import { parseBrainDump } from "@/lib/brain-dump/heuristic";
import { MAX_BRAIN_DUMP_CHARS, type BrainDumpResponse, type ParsedTask } from "@/lib/brain-dump/schema";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  TIMES_OF_DAY,
  TIME_OF_DAY_LABEL,
  type Task,
} from "@/lib/types";
import { formatDuration, relativeDayLabel, toHHMM } from "@/lib/time";
import { useAppStore } from "@/lib/store";

const EXAMPLE =
  "I have an exam tomorrow, need to finish my portfolio website, go to the gym for an hour, and call my friend tonight.";

interface ReviewItem extends ParsedTask {
  key: number;
  include: boolean;
}

async function requestBrainDump(text: string, today: string, nowMin: number, timezone: string): Promise<BrainDumpResponse> {
  try {
    const res = await fetch("/api/ai/brain-dump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, today, nowTime: toHHMM(nowMin), timezone }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body as BrainDumpResponse;
  } catch (error) {
    if (error instanceof TypeError) {
      // Network failure: organize locally so the user isn't stuck.
      return {
        source: "fallback",
        provider: null,
        tasks: parseBrainDump(text, today),
        notice: "Couldn't reach the server, so this was organized on your device. Double-check the details.",
      };
    }
    throw error;
  }
}

export function BrainDumpInput({ variant = "hero", onSaved }: { variant?: "hero" | "dialog"; onSaved?: () => void }) {
  const { today, nowMin, tz } = useClock();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrainDumpResponse | null>(null);

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setError("Write down a few things on your mind first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await requestBrainDump(trimmed, today, nowMin, tz);
      if (res.tasks.length === 0) setError(res.notice ?? "No actionable tasks were found. Try describing what you need to do.");
      else setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const remaining = MAX_BRAIN_DUMP_CHARS - text.length;

  return (
    <div className={cn(variant === "hero" && "space-y-3")}>
      <div
        className={cn(
          "rounded-xl border bg-background/60 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
          error && "border-destructive/60",
        )}
      >
        <label htmlFor={`brain-dump-${variant}`} className="sr-only">
          Everything on your mind
        </label>
        <Textarea
          id={`brain-dump-${variant}`}
          value={text}
          maxLength={MAX_BRAIN_DUMP_CHARS}
          rows={variant === "hero" ? 4 : 7}
          placeholder={`Everything on your mind, in any order. For example: “${EXAMPLE}”`}
          className="min-h-24 resize-none border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `brain-dump-error-${variant}` : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {text.length === 0 ? (
              <button type="button" className="underline-offset-2 hover:text-foreground hover:underline" onClick={() => setText(EXAMPLE)}>
                Try an example
              </button>
            ) : (
              <span className={cn(remaining < 200 && "text-warning")}>{remaining.toLocaleString()} characters left</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>↵</Kbd>
            </span>
            <Button onClick={() => void submit()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {loading ? "Organizing…" : "Fix my day"}
            </Button>
          </div>
        </div>
      </div>
      {error && (
        <p id={`brain-dump-error-${variant}`} className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="size-3.5" /> {error}
        </p>
      )}

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-h-[90dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {result && (
            <BrainDumpReview
              result={result}
              today={today}
              onCancel={() => setResult(null)}
              onSaved={() => {
                setResult(null);
                setText("");
                onSaved?.();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BrainDumpReview({
  result,
  today,
  onCancel,
  onSaved,
}: {
  result: BrainDumpResponse;
  today: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const allGoals = useAppStore((s) => s.data.goals);
  const goals = allGoals.filter((g) => g.status === "active");
  const [items, setItems] = useState<ReviewItem[]>(() => result.tasks.map((t, key) => ({ ...t, key, include: true })));
  const [goalId, setGoalId] = useState("");
  const included = items.filter((i) => i.include);
  const totalMinutes = included.reduce((s, i) => s + i.estimatedMinutes, 0);

  const update = (key: number, patch: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function save(plan: boolean) {
    if (included.length === 0) return;
    const built = new Map<number, Task>();
    for (const item of included) {
      built.set(
        item.key,
        buildTask({
          title: item.title.trim() || "Untitled task",
          description: item.description,
          priority: item.priority,
          category: item.category,
          estimatedMinutes: Math.min(720, Math.max(5, Math.round(item.estimatedMinutes) || 30)),
          dueDate: item.dueDate,
          dueTime: item.dueDate ? item.dueTime : null,
          preferredTime: item.preferredTime,
          tags: item.tags,
          goalId: goalId || null,
        }),
      );
    }
    // Dependencies refer to positions in the original list; keep only approved ones.
    const tasks = included.map((item) => ({
      ...built.get(item.key)!,
      dependsOn: item.dependsOn.map((idx) => built.get(items[idx]?.key ?? -1)?.id).filter((id): id is string => !!id),
    }));
    createTasks(tasks);
    toast.success(`Added ${tasks.length} task${tasks.length === 1 ? "" : "s"}`, {
      action: plan ? undefined : { label: "Plan my day", onClick: () => router.push("/planner?generate=1") },
    });
    onSaved();
    if (plan) router.push("/planner?generate=1");
  }

  return (
    <div className="flex max-h-[90dvh] flex-col">
      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle className="font-display text-2xl font-normal">Review your tasks</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          <SourceBadge result={result} />
          Edit anything that looks off, untick what you don&apos;t want, then save.
        </DialogDescription>
        {result.notice && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {result.notice}
          </p>
        )}
      </DialogHeader>

      <ul className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {items.map((item, idx) => (
          <li
            key={item.key}
            className={cn(
              "rounded-xl border bg-surface/50 p-3 transition-opacity",
              !item.include && "opacity-50",
            )}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                className="mt-2"
                checked={item.include}
                aria-label={`Include “${item.title}”`}
                onCheckedChange={(v) => update(item.key, { include: !!v })}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Task title"
                    value={item.title}
                    maxLength={200}
                    className="h-8 font-medium"
                    onChange={(e) => update(item.key, { title: e.target.value })}
                  />
                  <ConfidenceDot value={item.confidence} />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <NativeSelect aria-label="Priority" value={item.priority} onChange={(e) => update(item.key, { priority: e.target.value as Task["priority"] })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </NativeSelect>
                  <NativeSelect aria-label="Category" value={item.category} onChange={(e) => update(item.key, { category: e.target.value as Task["category"] })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </NativeSelect>
                  <div className="relative">
                    <Input
                      aria-label="Estimated minutes"
                      type="number"
                      min={5}
                      max={720}
                      step={5}
                      value={item.estimatedMinutes}
                      className="h-8 pr-9"
                      onChange={(e) => update(item.key, { estimatedMinutes: Number(e.target.value) })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                  </div>
                  <NativeSelect aria-label="Best time" value={item.preferredTime} onChange={(e) => update(item.key, { preferredTime: e.target.value as Task["preferredTime"] })}>
                    {TIMES_OF_DAY.map((t) => <option key={t} value={t}>{TIME_OF_DAY_LABEL[t]}</option>)}
                  </NativeSelect>
                  <Input
                    aria-label="Due date"
                    type="date"
                    value={item.dueDate ?? ""}
                    className="h-8"
                    onChange={(e) => update(item.key, { dueDate: e.target.value || null, dueTime: e.target.value ? item.dueTime : null })}
                  />
                  <Input
                    aria-label="Due time"
                    type="time"
                    value={item.dueTime ?? ""}
                    disabled={!item.dueDate}
                    className="h-8"
                    onChange={(e) => update(item.key, { dueTime: e.target.value || null })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {item.dueDate ? (
                    <span>Due {relativeDayLabel(item.dueDate, today).toLowerCase()}</span>
                  ) : (
                    <span>No deadline</span>
                  )}
                  {item.dependsOn.length > 0 && (
                    <span>
                      After: {item.dependsOn.map((d) => `“${items[d]?.title ?? "?"}”`).join(", ")}
                    </span>
                  )}
                  {item.description && !item.description.startsWith("From your brain dump") && <span className="truncate">{item.description}</span>}
                </div>
                {item.clarification && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <HelpCircle className="mt-0.5 size-3.5 shrink-0" /> {item.clarification}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={item.include ? `Remove “${item.title}”` : `Restore “${item.title}”`}
                onClick={() => update(item.key, { include: !item.include })}
              >
                {item.include ? <Trash2 /> : <Undo2 />}
              </Button>
            </div>
            <span className="sr-only">Task {idx + 1}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            {included.length} of {items.length} selected · {formatDuration(totalMinutes)}
          </span>
          {goals.length > 0 && (
            <NativeSelect aria-label="Link to goal" value={goalId} onChange={(e) => setGoalId(e.target.value)} className="h-7 w-48 text-xs">
              <option value="">Not linked to a goal</option>
              {goals.map((g) => <option key={g.id} value={g.id}>Goal: {g.title}</option>)}
            </NativeSelect>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" disabled={included.length === 0} onClick={() => save(false)}>
            <Check /> Save tasks
          </Button>
          <Button disabled={included.length === 0} onClick={() => save(true)}>
            <CalendarRange /> Save &amp; plan
          </Button>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ result }: { result: BrainDumpResponse }) {
  const label =
    result.source === "ai" ? `Organized by AI · ${result.provider}` : result.source === "demo" ? "Demo parser (AI not configured)" : "Built-in parser (AI unavailable)";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset",
        result.source === "ai" ? "bg-primary/10 text-primary ring-primary/25" : "bg-muted text-muted-foreground ring-border",
      )}
    >
      {result.source === "ai" ? <Sparkles className="size-3" /> : <Brain className="size-3" />}
      {label}
    </span>
  );
}

function ConfidenceDot({ value }: { value: number }) {
  const level = value >= 0.75 ? "high" : value >= 0.5 ? "medium" : "low";
  return (
    <span
      title={`Interpretation confidence: ${level}`}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px]",
        level === "high" ? "text-success" : level === "medium" ? "text-warning" : "text-destructive",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      <span className="hidden sm:inline">{level === "high" ? "Clear" : level === "medium" ? "Check" : "Unsure"}</span>
      <span className="sr-only">Confidence {level}</span>
    </span>
  );
}

export function BrainDumpDialog() {
  const open = useUI((s) => s.brainDumpOpen);
  const setOpen = useUI((s) => s.setBrainDumpOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-normal">
            <Brain className="size-5 text-primary" /> Brain dump
          </DialogTitle>
          <DialogDescription>
            Write everything on your mind. You&apos;ll review the extracted tasks before anything is saved.
          </DialogDescription>
        </DialogHeader>
        <BrainDumpInput variant="dialog" onSaved={() => setOpen(false)} />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="size-3" /> Deadlines are only set when you mention them.
        </p>
      </DialogContent>
    </Dialog>
  );
}
