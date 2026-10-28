"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Archive, Check, Flag, Flame, MoreHorizontal, Pencil, Plus, Repeat, Target, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, Field, NativeSelect, PageHeader, Panel, PanelHeader } from "@/components/app/primitives";
import { TaskRow } from "@/components/app/task-row";
import { useAppData } from "@/lib/store";
import { useClock } from "@/hooks/use-clock";
import { createTask, deleteGoal, deleteHabit, newId, saveGoal, saveHabit, toggleHabitLog } from "@/lib/app-actions";
import { goalProgress, habitConsistency, habitStreak, habitWeek } from "@/lib/analytics";
import { diffDays, formatShortDate, relativeDayLabel, weekdayShort } from "@/lib/time";
import type { Goal, Habit } from "@/lib/types";

export default function GoalsPage() {
  const data = useAppData();
  const [goalDraft, setGoalDraft] = useState<Goal | null>(null);
  const [habitDraft, setHabitDraft] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const goals = data.goals
    .filter((g) => (showArchived ? true : g.status !== "archived"))
    .sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || (a.targetDate ?? "9").localeCompare(b.targetDate ?? "9"));
  const habits = data.habits.filter((h) => !h.archived);

  const blankGoal = (): Goal => ({ id: newId(), title: "", description: "", targetDate: null, status: "active", createdAt: new Date().toISOString() });
  const blankHabit = (): Habit => ({ id: newId(), title: "", targetPerWeek: 5, archived: false, createdAt: new Date().toISOString() });

  return (
    <div>
      <PageHeader
        title="Goals & habits"
        description="Break bigger outcomes into tasks, and keep small routines going. Missed days are normal; consistency over weeks is what counts."
        actions={
          <>
            <Button variant="outline" onClick={() => setHabitDraft(blankHabit())}><Repeat /> New habit</Button>
            <Button onClick={() => setGoalDraft(blankGoal())}><Plus /> New goal</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="goals-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="goals-heading" className="eyebrow">Goals</h2>
            {data.goals.some((g) => g.status === "archived") && (
              <Button size="xs" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Button>
            )}
          </div>
          {goals.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Target}
                title="No goals yet"
                description="A goal is something bigger than a single task, like “Launch my portfolio”. Add one and break it into steps."
                action={<Button size="sm" onClick={() => setGoalDraft(blankGoal())}><Plus /> New goal</Button>}
              />
            </Panel>
          ) : (
            goals.map((g) => <GoalCard key={g.id} goal={g} onEdit={() => setGoalDraft(g)} />)
          )}
        </section>

        <section aria-labelledby="habits-heading" className="space-y-4">
          <h2 id="habits-heading" className="eyebrow">Habits</h2>
          <Panel>
            {habits.length === 0 ? (
              <EmptyState
                icon={Repeat}
                title="No habits yet"
                description="Track small routines like reading, stretching or a daily walk."
                action={<Button size="sm" variant="outline" onClick={() => setHabitDraft(blankHabit())}><Plus /> New habit</Button>}
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {habits.map((h) => <HabitRow key={h.id} habit={h} onEdit={() => setHabitDraft(h)} />)}
              </ul>
            )}
          </Panel>
        </section>
      </div>

      <GoalDialog draft={goalDraft} onClose={() => setGoalDraft(null)} />
      <HabitDialog draft={habitDraft} onClose={() => setHabitDraft(null)} />
    </div>
  );
}

function GoalCard({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const data = useAppData();
  const { today, nowMin } = useClock();
  const [step, setStep] = useState("");
  const progress = goalProgress(goal.id, data.tasks);
  const linked = data.tasks
    .filter((t) => t.goalId === goal.id)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const daysLeft = goal.targetDate ? diffDays(today, goal.targetDate) : null;

  function addStep() {
    const title = step.trim();
    if (!title) return;
    createTask({ title, goalId: goal.id, category: "personal" });
    setStep("");
  }

  return (
    <Panel className={cn(goal.status !== "active" && "opacity-75")}>
      <PanelHeader
        icon={goal.status === "achieved" ? Trophy : Target}
        title={goal.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {goal.targetDate && (
              <span className="inline-flex items-center gap-1">
                <Flag className="size-3" aria-hidden />
                {formatShortDate(goal.targetDate)}
                {goal.status === "active" && daysLeft !== null && (daysLeft >= 0 ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : " · target date passed. Adjust it if plans changed.")}
              </span>
            )}
            {goal.status === "achieved" && <span className="text-success">Achieved</span>}
            {goal.status === "archived" && <span>Archived</span>}
          </span>
        }
        action={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${goal.title}`} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}><Pencil /> Edit</DropdownMenuItem>
              {goal.status !== "achieved" && (
                <DropdownMenuItem onClick={() => { saveGoal({ ...goal, status: "achieved" }); toast.success("Goal achieved. Well done!"); }}>
                  <Trophy /> Mark achieved
                </DropdownMenuItem>
              )}
              {goal.status !== "active" && <DropdownMenuItem onClick={() => saveGoal({ ...goal, status: "active" })}><Target /> Reactivate</DropdownMenuItem>}
              {goal.status === "active" && <DropdownMenuItem onClick={() => saveGoal({ ...goal, status: "archived" })}><Archive /> Archive</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  const undo = deleteGoal(goal.id);
                  toast("Goal deleted. Its tasks were kept.", { action: undo ? { label: "Undo", onClick: undo } : undefined });
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="px-5 pt-4">
        {goal.description && <p className="mb-3 text-sm text-muted-foreground">{goal.description}</p>}
        <div className="flex items-center gap-3">
          <Progress value={progress.ratio * 100} className="flex-1" aria-label={`${goal.title} progress`} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {progress.done}/{progress.total} steps
          </span>
        </div>
      </div>
      <div className="p-2 pb-3">
        {linked.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} today={today} nowMin={nowMin} dense />)}
        {linked.length > 6 && <p className="px-3 py-1 text-xs text-muted-foreground">+{linked.length - 6} more steps in Tasks</p>}
        {goal.status === "active" && (
          <form
            className="mt-1 flex gap-2 px-3"
            onSubmit={(e) => {
              e.preventDefault();
              addStep();
            }}
          >
            <Input aria-label={`Add a step to ${goal.title}`} placeholder="Add a step…" value={step} onChange={(e) => setStep(e.target.value)} maxLength={200} className="h-8" />
            <Button type="submit" size="sm" variant="outline" disabled={!step.trim()}><Plus /> Add</Button>
          </form>
        )}
      </div>
    </Panel>
  );
}

function HabitRow({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const data = useAppData();
  const { today } = useClock();
  const week = habitWeek(habit, data.habitLogs, today, data.profile.weekStartsOn);
  const streak = habitStreak(habit.id, data.habitLogs, today);
  const consistency = habitConsistency(habit, data.habitLogs, today, data.profile.weekStartsOn);
  const doneToday = week.days.find((d) => d.date === today)?.done ?? false;

  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{habit.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{week.done}/{week.target} this week{week.done >= week.target && " ✓"}</span>
            {streak > 0 && <span className="inline-flex items-center gap-1"><Flame className="size-3 text-primary" aria-hidden /> {streak}-day streak</span>}
            <span>{Math.round(consistency * 100)}% of the last 4 weeks on target</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant={doneToday ? "secondary" : "default"} onClick={() => toggleHabitLog(habit.id, today)} aria-pressed={doneToday}>
            <Check /> {doneToday ? "Done today" : "Check in"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${habit.title}`} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}><Pencil /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => saveHabit({ ...habit, archived: true })}><Archive /> Archive</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  const undo = deleteHabit(habit.id);
                  toast("Habit deleted", { action: undo ? { label: "Undo", onClick: undo } : undefined });
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label={`${habit.title} this week`}>
        {week.days.map((d) => (
          <button
            key={d.date}
            type="button"
            disabled={d.future}
            onClick={() => toggleHabitLog(habit.id, d.date)}
            aria-pressed={d.done}
            aria-label={`${relativeDayLabel(d.date, today)}: ${d.done ? "done" : "not done"}`}
            className={cn(
              "flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] transition-colors",
              d.done ? "border-primary/40 bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/50",
              d.future && "cursor-not-allowed opacity-40",
              d.date === today && "ring-1 ring-ring/60",
            )}
          >
            {weekdayShort(d.date)}
            {d.done ? <Check className="size-3.5 text-primary" /> : <span className="size-3.5" />}
          </button>
        ))}
      </div>
    </li>
  );
}

function GoalDialog({ draft, onClose }: { draft: Goal | null; onClose: () => void }) {
  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{draft && <GoalForm key={draft.id} draft={draft} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function GoalForm({ draft, onClose }: { draft: Goal; onClose: () => void }) {
  const data = useAppData();
  const isNew = !data.goals.some((g) => g.id === draft.id);
  const [goal, setGoal] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!goal.title.trim()) return setError("Give your goal a name.");
        saveGoal({ ...goal, title: goal.title.trim() });
        toast.success(isNew ? "Goal created. Add a few steps to get going." : "Goal updated");
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle className="font-display text-2xl font-normal">{isNew ? "New goal" : "Edit goal"}</DialogTitle>
        <DialogDescription>Something you want to achieve over weeks or months.</DialogDescription>
      </DialogHeader>
      <Field label="Goal" htmlFor="goal-title" error={error}>
        <Input id="goal-title" autoFocus value={goal.title} maxLength={200} placeholder="e.g. Launch my portfolio site" onChange={(e) => { setGoal({ ...goal, title: e.target.value }); setError(null); }} />
      </Field>
      <Field label="Why it matters (optional)" htmlFor="goal-desc">
        <Textarea id="goal-desc" rows={3} value={goal.description} maxLength={2000} onChange={(e) => setGoal({ ...goal, description: e.target.value })} />
      </Field>
      <Field label="Target date (optional)" htmlFor="goal-date">
        <Input id="goal-date" type="date" value={goal.targetDate ?? ""} onChange={(e) => setGoal({ ...goal, targetDate: e.target.value || null })} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">{isNew ? "Create goal" : "Save"}</Button>
      </DialogFooter>
    </form>
  );
}

function HabitDialog({ draft, onClose }: { draft: Habit | null; onClose: () => void }) {
  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{draft && <HabitForm key={draft.id} draft={draft} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function HabitForm({ draft, onClose }: { draft: Habit; onClose: () => void }) {
  const data = useAppData();
  const isNew = !data.habits.some((h) => h.id === draft.id);
  const [habit, setHabit] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!habit.title.trim()) return setError("Name your habit.");
        saveHabit({ ...habit, title: habit.title.trim() });
        toast.success(isNew ? "Habit added" : "Habit updated");
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle className="font-display text-2xl font-normal">{isNew ? "New habit" : "Edit habit"}</DialogTitle>
        <DialogDescription>Pick a realistic weekly target. You can always change it.</DialogDescription>
      </DialogHeader>
      <Field label="Habit" htmlFor="habit-title" error={error}>
        <Input id="habit-title" autoFocus value={habit.title} maxLength={120} placeholder="e.g. Read for 20 minutes" onChange={(e) => { setHabit({ ...habit, title: e.target.value }); setError(null); }} />
      </Field>
      <Field label="Times per week" htmlFor="habit-target">
        <NativeSelect id="habit-target" value={habit.targetPerWeek} onChange={(e) => setHabit({ ...habit, targetPerWeek: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 7 ? "Every day" : `${n}× per week`}</option>)}
        </NativeSelect>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">{isNew ? "Add habit" : "Save"}</Button>
      </DialogFooter>
    </form>
  );
}
