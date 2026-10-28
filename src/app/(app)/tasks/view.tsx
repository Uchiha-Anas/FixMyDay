"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "cn";
import { ArrowLeft, ArrowRight, Brain, Columns3, List, ListChecks, Plus, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryTag, DueChip, EmptyState, NativeSelect, PageHeader, Panel, PriorityBadge } from "@/components/app/primitives";
import { TaskRow } from "@/components/app/task-row";
import { useAppData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useClock } from "@/hooks/use-clock";
import { setTaskStatus } from "@/lib/app-actions";
import { isOverdue } from "@/lib/analytics";
import { PRIORITY_WEIGHT } from "@/lib/scheduler";
import { addDays, formatDuration } from "@/lib/time";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL, type Task, type TaskStatus } from "@/lib/types";

type StatusFilter = "open" | "all" | "done" | "overdue" | "in_progress";
type SortKey = "smart" | "due" | "priority" | "newest" | "duration";

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["overdue", "Overdue"],
  ["done", "Completed"],
  ["all", "All"],
];

export default function TasksPage() {
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}

function TasksView() {
  const params = useSearchParams();
  const data = useAppData();
  const { today, nowMin } = useClock();
  const openNewTask = useUI((s) => s.openNewTask);
  const setBrainDumpOpen = useUI((s) => s.setBrainDumpOpen);

  const initialFilter = params.get("filter");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_FILTERS.some(([k]) => k === initialFilter) ? (initialFilter as StatusFilter) : "open",
  );
  const [priority, setPriority] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("smart");
  const [view, setView] = useState<"list" | "board">("list");

  const goalTitles = useMemo(() => new Map(data.goals.map((g) => [g.id, g.title])), [data.goals]);
  const openIds = useMemo(() => new Set(data.tasks.filter((t) => t.status !== "done").map((t) => t.id)), [data.tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.tasks.filter((t) => {
      if (view === "list") {
        if (status === "open" && t.status === "done") return false;
        if (status === "done" && t.status !== "done") return false;
        if (status === "in_progress" && t.status !== "in_progress") return false;
        if (status === "overdue" && !isOverdue(t, today, nowMin)) return false;
      }
      if (priority && t.priority !== priority) return false;
      if (category && t.category !== category) return false;
      if (q && !`${t.title} ${t.description} ${t.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
      smart: (a, b) =>
        Number(isOverdue(b, today, nowMin)) - Number(isOverdue(a, today, nowMin)) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
      due: (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"),
      priority: (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      duration: (a, b) => a.estimatedMinutes - b.estimatedMinutes,
    };
    return list.sort((a, b) => {
      if (status === "done" || status === "all") {
        const doneOrder = Number(a.status === "done") - Number(b.status === "done");
        if (doneOrder) return doneOrder;
        if (a.status === "done" && b.status === "done") return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
      }
      return cmp[sort](a, b);
    });
  }, [data.tasks, query, status, priority, category, sort, view, today, nowMin]);

  const groups = useMemo(() => {
    if (sort !== "smart" || status === "done") return [{ label: null as string | null, tasks: filtered }];
    const weekEnd = addDays(today, 7);
    const buckets: Array<{ label: string; test: (t: Task) => boolean }> = [
      { label: "Overdue", test: (t) => isOverdue(t, today, nowMin) },
      { label: "Today", test: (t) => t.status !== "done" && t.dueDate === today },
      { label: "Next 7 days", test: (t) => t.status !== "done" && !!t.dueDate && t.dueDate > today && t.dueDate <= weekEnd },
      { label: "Later", test: (t) => t.status !== "done" && !!t.dueDate && t.dueDate > weekEnd },
      { label: "No deadline", test: (t) => t.status !== "done" && !t.dueDate },
      { label: "Completed", test: (t) => t.status === "done" },
    ];
    const used = new Set<string>();
    return buckets
      .map((b) => {
        const tasks = filtered.filter((t) => !used.has(t.id) && b.test(t));
        tasks.forEach((t) => used.add(t.id));
        return { label: b.label as string | null, tasks };
      })
      .filter((g) => g.tasks.length > 0);
  }, [filtered, sort, status, today, nowMin]);

  const hasAnyTasks = data.tasks.length > 0;
  const filtersActive = query || priority || category || (view === "list" && status !== "open");
  const isBlocked = (t: Task) => t.dependsOn.some((d) => openIds.has(d));

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${openIds.size} open · ${formatDuration(
          data.tasks.filter((t) => t.status !== "done").reduce((s, t) => s + t.estimatedMinutes, 0),
        )} of estimated work`}
        actions={
          <>
            <Button variant="outline" onClick={() => setBrainDumpOpen(true)}>
              <Brain /> Brain dump
            </Button>
            <Button onClick={() => openNewTask()}>
              <Plus /> New task
            </Button>
          </>
        }
      />

      <Panel className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search tasks"
            placeholder="Search titles, notes and tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {view === "list" && (
            <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="sm:w-36">
              {STATUS_FILTERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </NativeSelect>
          )}
          <NativeSelect aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="sm:w-36">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-36">
            <option value="">Any category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="sm:w-40">
            <option value="smart">Sort: Smart</option>
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="newest">Sort: Newest</option>
            <option value="duration">Sort: Shortest first</option>
          </NativeSelect>
          <Tabs value={view} onValueChange={(v) => setView(v as "list" | "board")} className="col-span-2">
            <TabsList>
              <TabsTrigger value="list" aria-label="List view"><List /> List</TabsTrigger>
              <TabsTrigger value="board" aria-label="Board view"><Columns3 /> Board</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Panel>

      {!hasAnyTasks ? (
        <Panel>
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            description="Add your first task, or write a brain dump and let FixMyDay extract tasks for you."
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBrainDumpOpen(true)}><Brain /> Brain dump</Button>
                <Button onClick={() => openNewTask()}><Plus /> New task</Button>
              </div>
            }
          />
        </Panel>
      ) : view === "board" ? (
        <Board tasks={filtered} today={today} nowMin={nowMin} isBlocked={isBlocked} />
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={SearchX}
            title={status === "overdue" && !query ? "Nothing overdue" : "No matching tasks"}
            description={status === "overdue" && !query ? "You're on top of your deadlines." : "Try a different search or clear the filters."}
            action={
              filtersActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setPriority("");
                    setCategory("");
                    setStatus("open");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Panel key={g.label ?? "all"} className="p-2">
              {g.label && (
                <h2 className={cn("eyebrow px-3 pt-2 pb-1", g.label === "Overdue" && "text-destructive")}>
                  {g.label} <span className="ml-1 tabular-nums">{g.tasks.length}</span>
                </h2>
              )}
              <div className="divide-y divide-border/60">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    nowMin={nowMin}
                    blocked={t.status !== "done" && isBlocked(t)}
                    goalTitle={t.goalId ? goalTitles.get(t.goalId) : undefined}
                  />
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

function Board({
  tasks,
  today,
  nowMin,
  isBlocked,
}: {
  tasks: Task[];
  today: string;
  nowMin: number;
  isBlocked: (t: Task) => boolean;
}) {
  const openTask = useUI((s) => s.openTask);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col, ci) => {
        const items = tasks.filter((t) => t.status === col.status);
        const shown = col.status === "done" ? items.slice(0, 30) : items;
        return (
          <Panel
            key={col.status}
            className={cn("flex min-h-64 flex-col p-2 transition-colors", dragOver === col.status && "border-primary/50 bg-primary/5")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.status);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("text/task-id");
              if (id) setTaskStatus(id, col.status);
            }}
            aria-label={`${col.label} column`}
          >
            <h2 className="eyebrow flex items-center justify-between px-2 pt-2 pb-2">
              {col.label}
              <span className="tabular-nums">{items.length}</span>
            </h2>
            <ul className="flex flex-1 flex-col gap-2">
              {shown.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                  className="group rounded-xl border bg-background/60 p-3 shadow-sm"
                >
                  <button type="button" className="w-full text-left" onClick={() => openTask(t.id)}>
                    <span className={cn("block text-sm", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      {t.status !== "done" && <PriorityBadge priority={t.priority} />}
                      <CategoryTag category={t.category} />
                      <DueChip task={t} today={today} nowMin={nowMin} />
                    </span>
                    {t.status !== "done" && isBlocked(t) && (
                      <span className="mt-1 block text-xs text-muted-foreground">Waiting on another task</span>
                    )}
                  </button>
                  <div className="mt-2 flex justify-between opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={ci === 0}
                      aria-label={`Move “${t.title}” to ${COLUMNS[ci - 1]?.label ?? ""}`}
                      onClick={() => setTaskStatus(t.id, COLUMNS[ci - 1].status)}
                    >
                      <ArrowLeft />
                    </Button>
                    <span className="text-xs text-muted-foreground">{formatDuration(t.estimatedMinutes)}</span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={ci === COLUMNS.length - 1}
                      aria-label={`Move “${t.title}” to ${COLUMNS[ci + 1]?.label ?? ""}`}
                      onClick={() => setTaskStatus(t.id, COLUMNS[ci + 1].status)}
                    >
                      <ArrowRight />
                    </Button>
                  </div>
                </li>
              ))}
              {items.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted-foreground">Drop tasks here</li>}
              {items.length > shown.length && (
                <li className="px-2 py-2 text-center text-xs text-muted-foreground">+{items.length - shown.length} older completed tasks</li>
              )}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
