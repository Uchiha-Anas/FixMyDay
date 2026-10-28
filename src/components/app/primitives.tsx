"use client";

import * as React from "react";
import { cn } from "cn";
import { AlertTriangle, CalendarClock, Loader2, RotateCcw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABEL, PRIORITY_LABEL, type Category, type Priority, type Task } from "@/lib/types";
import { formatClock, relativeDayLabel, toMinutes } from "@/lib/time";

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("surface-card min-w-0", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat py-1 pr-7 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-xl border bg-muted/40">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading your day…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
      <div className="grid size-10 place-items-center rounded-xl bg-destructive/10">
        <AlertTriangle className="size-5 text-destructive" aria-hidden />
      </div>
      <p className="text-sm font-medium">We couldn&apos;t load your data</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: "bg-destructive/12 text-destructive ring-destructive/25",
  high: "bg-warning/12 text-warning ring-warning/25",
  medium: "bg-info/10 text-info ring-info/20",
  low: "bg-muted text-muted-foreground ring-border",
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset",
        PRIORITY_STYLE[priority],
        className,
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export const CATEGORY_COLOR: Record<Category, string> = {
  work: "bg-chart-1",
  study: "bg-chart-3",
  health: "bg-chart-2",
  personal: "bg-chart-5",
  errands: "bg-muted-foreground",
  social: "bg-chart-4",
  home: "bg-[oklch(0.7_0.08_120)]",
  finance: "bg-[oklch(0.72_0.1_200)]",
};

export function CategoryTag({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className={cn("size-1.5 rounded-full", CATEGORY_COLOR[category])} aria-hidden />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function DueChip({ task, today, nowMin }: { task: Task; today: string; nowMin: number }) {
  if (!task.dueDate) return null;
  const overdue =
    task.status !== "done" &&
    (task.dueDate < today || (task.dueDate === today && task.dueTime !== null && toMinutes(task.dueTime) < nowMin));
  const soon = task.status !== "done" && !overdue && task.dueDate <= today;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-destructive" : soon ? "text-warning" : "text-muted-foreground",
      )}
    >
      <CalendarClock className="size-3.5" aria-hidden />
      {overdue && "Overdue · "}
      {relativeDayLabel(task.dueDate, today)}
      {task.dueTime && ` ${formatClock(toMinutes(task.dueTime))}`}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="hidden h-5 min-w-5 items-center justify-center rounded border bg-muted/60 px-1 font-mono text-[10px] text-muted-foreground sm:inline-flex">
      {children}
    </kbd>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-surface/60 px-4 py-3", className)}>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
