import { z } from "zod";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CATEGORIES = [
  "work",
  "study",
  "health",
  "personal",
  "errands",
  "social",
  "home",
  "finance",
] as const;
export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "any"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export const RECURRENCES = ["none", "daily", "weekdays", "weekly"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Recurrence = (typeof RECURRENCES)[number];

const id = z.string().min(1).max(64);
/** Calendar date in the user's time zone, "YYYY-MM-DD". */
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
/** Wall-clock time in the user's time zone, "HH:MM" (24h). */
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");
const isoTs = z.string().min(10).max(40);

export const taskSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  estimatedMinutes: z.number().int().min(5).max(720),
  dueDate: dateStr.nullable(),
  dueTime: timeStr.nullable(),
  dependsOn: z.array(id).max(20),
  preferredTime: z.enum(TIMES_OF_DAY),
  recurrence: z.enum(RECURRENCES),
  goalId: id.nullable(),
  completedAt: isoTs.nullable(),
  createdAt: isoTs,
  updatedAt: isoTs,
});
export type Task = z.infer<typeof taskSchema>;

export const blockSchema = z
  .object({
    id,
    date: dateStr,
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    kind: z.enum(["task", "event", "break"]),
    taskId: id.nullable(),
    title: z.string().trim().min(1).max(200),
    locked: z.boolean(),
    source: z.enum(["planner", "manual"]),
  })
  .refine((b) => b.endMin > b.startMin, "Block must end after it starts");
export type ScheduleBlock = z.infer<typeof blockSchema>;

export const focusSessionSchema = z.object({
  id,
  taskId: id.nullable(),
  startedAt: isoTs,
  endedAt: isoTs,
  plannedMinutes: z.number().int().min(1).max(240),
  focusedMinutes: z.number().int().min(0).max(240),
  completed: z.boolean(),
});
export type FocusSession = z.infer<typeof focusSessionSchema>;

export const goalSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  targetDate: dateStr.nullable(),
  status: z.enum(["active", "achieved", "archived"]),
  createdAt: isoTs,
});
export type Goal = z.infer<typeof goalSchema>;

export const habitSchema = z.object({
  id,
  title: z.string().trim().min(1).max(120),
  targetPerWeek: z.number().int().min(1).max(7),
  archived: z.boolean(),
  createdAt: isoTs,
});
export type Habit = z.infer<typeof habitSchema>;

export const habitLogSchema = z.object({ id, habitId: id, date: dateStr });
export type HabitLog = z.infer<typeof habitLogSchema>;

export const ACTIVITY_TYPES = [
  "task_created",
  "task_completed",
  "task_reopened",
  "task_deleted",
  "focus_completed",
  "plan_generated",
  "habit_logged",
] as const;
export const activitySchema = z.object({
  id,
  type: z.enum(ACTIVITY_TYPES),
  taskId: id.nullable(),
  title: z.string().max(200),
  at: isoTs,
});
export type ActivityEvent = z.infer<typeof activitySchema>;

export const profileSchema = z
  .object({
    displayName: z.string().trim().max(80),
    timezone: z.string().min(1).max(64),
    workStart: timeStr,
    workEnd: timeStr,
    workDays: z.array(z.number().int().min(0).max(6)).max(7),
    focusMinutes: z.number().int().min(5).max(180),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(5).max(90),
    bufferMinutes: z.number().int().min(0).max(30),
    breakAfterMinutes: z.number().int().min(30).max(240),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    theme: z.enum(["dark", "light", "system"]),
    breakReminders: z.boolean(),
    soundEnabled: z.boolean(),
    onboarded: z.boolean(),
  })
  .refine((p) => p.workEnd > p.workStart, "Working hours must end after they start");
export type Profile = z.infer<typeof profileSchema>;

export interface AppData {
  profile: Profile;
  tasks: Task[];
  blocks: ScheduleBlock[];
  focusSessions: FocusSession[];
  goals: Goal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  activity: ActivityEvent[];
}

export const appDataSchema = z.object({
  profile: profileSchema,
  tasks: z.array(taskSchema),
  blocks: z.array(blockSchema),
  focusSessions: z.array(focusSessionSchema),
  goals: z.array(goalSchema),
  habits: z.array(habitSchema),
  habitLogs: z.array(habitLogSchema),
  activity: z.array(activitySchema),
});

/**
 * Every change to user data is expressed as a mutation. The same mutations are
 * applied locally (optimistically, or as the source of truth in demo mode) and
 * sent to the server in cloud mode, so both modes share one code path.
 */
export const mutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.upsert"), task: taskSchema }),
  z.object({ type: z.literal("task.delete"), id }),
  z.object({ type: z.literal("block.upsert"), block: blockSchema }),
  z.object({ type: z.literal("block.delete"), id }),
  z.object({ type: z.literal("focus.add"), session: focusSessionSchema }),
  z.object({ type: z.literal("goal.upsert"), goal: goalSchema }),
  z.object({ type: z.literal("goal.delete"), id }),
  z.object({ type: z.literal("habit.upsert"), habit: habitSchema }),
  z.object({ type: z.literal("habit.delete"), id }),
  z.object({ type: z.literal("habitLog.add"), log: habitLogSchema }),
  z.object({ type: z.literal("habitLog.delete"), id }),
  z.object({ type: z.literal("activity.add"), event: activitySchema }),
  z.object({ type: z.literal("profile.update"), profile: profileSchema }),
]);
export type Mutation = z.infer<typeof mutationSchema>;
export const mutationBatchSchema = z.array(mutationSchema).min(1).max(200);

export const DEFAULT_PROFILE: Profile = {
  displayName: "",
  timezone: "UTC",
  workStart: "09:00",
  workEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
  focusMinutes: 50,
  shortBreakMinutes: 10,
  longBreakMinutes: 20,
  bufferMinutes: 5,
  breakAfterMinutes: 90,
  weekStartsOn: 1,
  theme: "dark",
  breakReminders: true,
  soundEnabled: true,
  onboarded: false,
};

export function emptyAppData(profile: Partial<Profile> = {}): AppData {
  return {
    profile: { ...DEFAULT_PROFILE, ...profile },
    tasks: [],
    blocks: [],
    focusSessions: [],
    goals: [],
    habits: [],
    habitLogs: [],
    activity: [],
  };
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  work: "Work",
  study: "Study",
  health: "Health",
  personal: "Personal",
  errands: "Errands",
  social: "Social",
  home: "Home",
  finance: "Finance",
};

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  any: "Any time",
};

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
};
