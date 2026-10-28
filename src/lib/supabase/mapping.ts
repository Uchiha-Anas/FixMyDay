import type { z } from "zod";
import {
  activitySchema,
  blockSchema,
  focusSessionSchema,
  goalSchema,
  habitLogSchema,
  habitSchema,
  taskSchema,
  type Mutation,
} from "../types";

/** Collection name in AppData → Postgres table + validator. */
export const TABLES = {
  tasks: { table: "tasks", schema: taskSchema },
  blocks: { table: "schedule_blocks", schema: blockSchema },
  focusSessions: { table: "focus_sessions", schema: focusSessionSchema },
  goals: { table: "goals", schema: goalSchema },
  habits: { table: "habits", schema: habitSchema },
  habitLogs: { table: "habit_logs", schema: habitLogSchema },
  activity: { table: "activity_events", schema: activitySchema },
} as const;

export const camelToSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const snakeToCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** App object → DB row. The user id always comes from the verified session. */
export function toRow(obj: Record<string, unknown>, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) row[camelToSnake(k)] = v;
  row.user_id = userId;
  return row;
}

/** DB row → app object, validated. Returns null for rows that fail validation. */
export function fromRow<S extends z.ZodType>(row: Record<string, unknown>, schema: S): z.infer<S> | null {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "user_id") continue;
    obj[snakeToCamel(k)] = v;
  }
  // Postgres `time`/timestamps can carry seconds or offsets; normalize to the app's formats.
  if (typeof obj.dueTime === "string") obj.dueTime = obj.dueTime.slice(0, 5);
  const parsed = schema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

export type DbOp =
  | { kind: "upsert"; table: string; row: Record<string, unknown> }
  | { kind: "delete"; table: string; id: string }
  | { kind: "profile"; row: Record<string, unknown> };

/** Translate a validated mutation into a DB operation scoped to `userId`. */
export function mutationToOp(m: Mutation, userId: string): DbOp {
  switch (m.type) {
    case "task.upsert":
      return { kind: "upsert", table: TABLES.tasks.table, row: toRow(m.task, userId) };
    case "task.delete":
      return { kind: "delete", table: TABLES.tasks.table, id: m.id };
    case "block.upsert":
      return { kind: "upsert", table: TABLES.blocks.table, row: toRow(m.block, userId) };
    case "block.delete":
      return { kind: "delete", table: TABLES.blocks.table, id: m.id };
    case "focus.add":
      return { kind: "upsert", table: TABLES.focusSessions.table, row: toRow(m.session, userId) };
    case "goal.upsert":
      return { kind: "upsert", table: TABLES.goals.table, row: toRow(m.goal, userId) };
    case "goal.delete":
      return { kind: "delete", table: TABLES.goals.table, id: m.id };
    case "habit.upsert":
      return { kind: "upsert", table: TABLES.habits.table, row: toRow(m.habit, userId) };
    case "habit.delete":
      return { kind: "delete", table: TABLES.habits.table, id: m.id };
    case "habitLog.add":
      return { kind: "upsert", table: TABLES.habitLogs.table, row: toRow(m.log, userId) };
    case "habitLog.delete":
      return { kind: "delete", table: TABLES.habitLogs.table, id: m.id };
    case "activity.add":
      return { kind: "upsert", table: TABLES.activity.table, row: toRow(m.event, userId) };
    case "profile.update": {
      const row = toRow(m.profile, userId);
      delete row.user_id;
      row.id = userId;
      return { kind: "profile", row };
    }
  }
}
