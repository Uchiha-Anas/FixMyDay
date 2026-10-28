import { z } from "zod";
import { CATEGORIES, PRIORITIES, TIMES_OF_DAY, dateStr, timeStr } from "../types";
import { diffDays } from "../time";

export const MAX_BRAIN_DUMP_CHARS = 4000;
export const MAX_PARSED_TASKS = 25;

export const parsedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES),
  estimatedMinutes: z.number().int().min(5).max(720),
  dueDate: dateStr.nullable(),
  dueTime: timeStr.nullable(),
  preferredTime: z.enum(TIMES_OF_DAY),
  /** Indexes of other tasks in the same list that must be done first. */
  dependsOn: z.array(z.number().int().min(0)).max(10),
  tags: z.array(z.string().max(40)).max(8),
  confidence: z.number().min(0).max(1),
  clarification: z.string().max(300).nullable(),
});
export type ParsedTask = z.infer<typeof parsedTaskSchema>;

export const brainDumpRequestSchema = z.object({
  text: z.string().trim().min(3, "Write a little more first.").max(MAX_BRAIN_DUMP_CHARS),
  today: dateStr,
  nowTime: timeStr,
  timezone: z.string().min(1).max(64),
});
export type BrainDumpRequest = z.infer<typeof brainDumpRequestSchema>;

export type BrainDumpSource = "ai" | "demo" | "fallback";

export interface BrainDumpResponse {
  source: BrainDumpSource;
  provider: string | null;
  tasks: ParsedTask[];
  notice: string | null;
}

/**
 * JSON Schema handed to the model for structured output. Kept deliberately
 * simple (no numeric bounds or formats) so every provider's structured-output
 * mode accepts it; bounds are enforced afterwards by `normalizeModelTasks`.
 */
export const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title", "description", "priority", "category", "estimatedMinutes", "dueDate",
          "dueTime", "preferredTime", "dependsOn", "tags", "confidence", "clarification",
        ],
        properties: {
          title: { type: "string", description: "Short imperative task title" },
          description: { type: "string", description: "One sentence of context taken from the user's words, or empty" },
          priority: { type: "string", enum: [...PRIORITIES] },
          category: { type: "string", enum: [...CATEGORIES] },
          estimatedMinutes: { type: "integer", description: "Realistic duration in minutes (5-720)" },
          dueDate: { type: ["string", "null"], description: "YYYY-MM-DD only if the user stated or clearly implied a date, else null" },
          dueTime: { type: ["string", "null"], description: "HH:MM 24h only if the user stated a time, else null" },
          preferredTime: { type: "string", enum: [...TIMES_OF_DAY] },
          dependsOn: { type: "array", items: { type: "integer" }, description: "0-based indexes of tasks in this list that must happen first" },
          tags: { type: "array", items: { type: "string" } },
          confidence: { type: "number", description: "0-1, how sure you are this task is interpreted correctly" },
          clarification: { type: ["string", "null"], description: "A short question for the user when something is ambiguous, else null" },
        },
      },
    },
  },
} as const;

const looseTask = z.object({
  title: z.unknown(),
  description: z.unknown().optional(),
  priority: z.unknown().optional(),
  category: z.unknown().optional(),
  estimatedMinutes: z.unknown().optional(),
  dueDate: z.unknown().optional(),
  dueTime: z.unknown().optional(),
  preferredTime: z.unknown().optional(),
  dependsOn: z.unknown().optional(),
  tags: z.unknown().optional(),
  confidence: z.unknown().optional(),
  clarification: z.unknown().optional(),
});

function pickEnum<T extends readonly string[]>(values: T, v: unknown, fallback: T[number]): T[number] {
  return typeof v === "string" && (values as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as T[number])
    : fallback;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Turn untrusted model output into valid ParsedTasks. Invalid entries are
 * dropped or repaired; dates the model produced are kept only when well-formed
 * and plausible (not in the past, within two years).
 */
export function normalizeModelTasks(raw: unknown, today: string): ParsedTask[] {
  const root = z.object({ tasks: z.array(z.unknown()) }).safeParse(raw);
  if (!root.success) throw new Error("Model output did not contain a task list.");

  const items = root.data.tasks.slice(0, MAX_PARSED_TASKS);
  const out: ParsedTask[] = [];
  const indexMap = new Map<number, number>();

  items.forEach((entry, originalIndex) => {
    const parsed = looseTask.safeParse(entry);
    if (!parsed.success) return;
    const t = parsed.data;
    const title = str(t.title, 200);
    if (!title) return;

    let dueDate: string | null = typeof t.dueDate === "string" && dateStr.safeParse(t.dueDate).success ? t.dueDate : null;
    if (dueDate) {
      const d = diffDays(today, dueDate);
      if (Number.isNaN(d) || d < 0 || d > 730) dueDate = null;
    }
    const dueTime =
      dueDate && typeof t.dueTime === "string" && timeStr.safeParse(t.dueTime).success ? t.dueTime : null;

    const minutes = typeof t.estimatedMinutes === "number" && Number.isFinite(t.estimatedMinutes)
      ? Math.round(t.estimatedMinutes)
      : 30;
    const confidence = typeof t.confidence === "number" && Number.isFinite(t.confidence) ? t.confidence : 0.6;

    indexMap.set(originalIndex, out.length);
    out.push({
      title,
      description: str(t.description, 1000),
      priority: pickEnum(PRIORITIES, t.priority, "medium"),
      category: pickEnum(CATEGORIES, t.category, "personal"),
      estimatedMinutes: Math.min(720, Math.max(5, minutes)),
      dueDate,
      dueTime,
      preferredTime: pickEnum(TIMES_OF_DAY, t.preferredTime, "any"),
      dependsOn: Array.isArray(t.dependsOn)
        ? t.dependsOn.filter((n): n is number => Number.isInteger(n)).slice(0, 10)
        : [],
      tags: Array.isArray(t.tags)
        ? t.tags.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 40)).slice(0, 8)
        : [],
      confidence: Math.min(1, Math.max(0, confidence)),
      clarification: str(t.clarification, 300) || null,
    });
  });

  // Re-map dependency indexes to the filtered list; drop self/unknown/forward-cyclic refs.
  out.forEach((task, i) => {
    task.dependsOn = [...new Set(task.dependsOn.map((d) => indexMap.get(d)).filter((d): d is number => d !== undefined && d !== i))];
  });
  return breakCycles(out).map((t) => parsedTaskSchema.parse(t));
}

/** Remove dependency edges that would create cycles. */
export function breakCycles<T extends { dependsOn: number[] }>(tasks: T[]): T[] {
  const state = new Array<0 | 1 | 2>(tasks.length).fill(0);
  const visit = (i: number) => {
    state[i] = 1;
    tasks[i].dependsOn = tasks[i].dependsOn.filter((d) => {
      if (d < 0 || d >= tasks.length || state[d] === 1) return false;
      if (state[d] === 0) visit(d);
      return true;
    });
    state[i] = 2;
  };
  tasks.forEach((_, i) => state[i] === 0 && visit(i));
  return tasks;
}
