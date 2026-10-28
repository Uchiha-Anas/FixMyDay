import type { ScheduleBlock, Task } from "./types";

let n = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: overrides.id ?? `t${n}`,
    title: `Task ${n}`,
    description: "",
    status: "todo",
    priority: "medium",
    category: "work",
    tags: [],
    estimatedMinutes: 30,
    dueDate: null,
    dueTime: null,
    dependsOn: [],
    preferredTime: "any",
    recurrence: "none",
    goalId: null,
    completedAt: null,
    createdAt: `2026-10-0${(n % 9) + 1}T09:00:00.000Z`,
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  };
}

export function makeBlock(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  n += 1;
  return {
    id: overrides.id ?? `b${n}`,
    date: "2026-10-28",
    startMin: 600,
    endMin: 660,
    kind: "event",
    taskId: null,
    title: `Block ${n}`,
    locked: true,
    source: "manual",
    ...overrides,
  };
}
