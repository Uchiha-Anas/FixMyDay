import type { ActivityEvent, AppData, FocusSession, Goal, Habit, HabitLog, Profile, ScheduleBlock, Task } from "./types";
import { addDays, minutesInTz, todayInTz, toMinutes } from "./time";
import { planDay } from "./scheduler";

/**
 * Realistic sample workspace for demo mode, generated relative to "now" so
 * the dashboard, analytics and calendar all have meaningful content.
 */
export function buildSampleData(profile: Profile, now = new Date(), makeId: () => string = () => crypto.randomUUID()): AppData {
  const tz = profile.timezone;
  const today = todayInTz(tz, now);
  const nowMin = minutesInTz(now, tz);
  const workStart = toMinutes(profile.workStart);

  /** ISO timestamp for local `minute` on `today + dayOffset` (DST drift ignored for sample data). */
  const at = (dayOffset: number, minute: number) =>
    new Date(now.getTime() - (-dayOffset * 1440 + nowMin - minute) * 60_000).toISOString();

  const goalDesign: Goal = {
    id: makeId(), title: "Land a product design role", status: "active", createdAt: at(-20, 600),
    description: "Polish the portfolio, refresh the resume and reach out to recruiters.", targetDate: addDays(today, 60),
  };
  const goalRun: Goal = {
    id: makeId(), title: "Run a half marathon", status: "active", createdAt: at(-30, 600),
    description: "Build up to 21 km with three runs a week.", targetDate: addDays(today, 90),
  };

  const t = (o: Partial<Task> & Pick<Task, "title">, createdDaysAgo = 3): Task => ({
    id: makeId(), description: "", status: "todo", priority: "medium", category: "work", tags: [],
    estimatedMinutes: 30, dueDate: null, dueTime: null, dependsOn: [], preferredTime: "any", recurrence: "none",
    goalId: null, completedAt: null, createdAt: at(-createdDaysAgo, 540), updatedAt: at(-createdDaysAgo, 540), ...o,
  });

  const caseStudy = t({
    title: "Finish portfolio case study: checkout redesign", priority: "high", estimatedMinutes: 120,
    dueDate: addDays(today, 1), goalId: goalDesign.id, tags: ["portfolio"],
    description: "Write up the problem, process and results. Add before/after screenshots and the conversion numbers.",
  }, 6);
  const resume = t({
    title: "Update resume with recent projects", estimatedMinutes: 45, goalId: goalDesign.id,
    dependsOn: [caseStudy.id], tags: ["portfolio"],
  }, 5);
  const open: Task[] = [
    t({
      title: "Prepare slides for the client demo", priority: "urgent", estimatedMinutes: 90, dueDate: today,
      dueTime: `${String(Math.min(17, Math.max(Math.floor(workStart / 60) + 6, 15))).padStart(2, "0")}:00`,
      description: "Walk through the new onboarding flow; include the two open questions about pricing.", tags: ["client"],
    }, 2),
    caseStudy,
    t({ title: "Review Maya's pull request (search filters)", estimatedMinutes: 30, dueDate: today, tags: ["code-review"] }, 1),
    t({ title: "Pay electricity bill", category: "finance", priority: "high", estimatedMinutes: 10, dueDate: addDays(today, 2) }, 4),
    t({ title: "Submit reimbursement form for conference travel", category: "finance", priority: "high", estimatedMinutes: 15, dueDate: addDays(today, -2) }, 8),
    t({ title: "Gym: upper body session", category: "health", estimatedMinutes: 60, preferredTime: "evening", goalId: null }, 1),
    t({ title: "Call Grandma", category: "social", estimatedMinutes: 20, preferredTime: "evening", dueDate: today }, 1),
    t({ title: "Read chapter 4 of Deep Work", category: "study", priority: "low", estimatedMinutes: 40, tags: ["reading"] }, 7),
    t({ title: "Book dentist appointment", category: "errands", priority: "low", estimatedMinutes: 10 }, 9),
    resume,
    t({
      title: "Send portfolio to three recruiters", priority: "high", estimatedMinutes: 30, goalId: goalDesign.id,
      dueDate: addDays(today, 4), dependsOn: [caseStudy.id, resume.id],
    }, 5),
    t({ title: "Grocery run for the week", category: "errands", estimatedMinutes: 45, preferredTime: "afternoon" }, 2),
    t({ title: "Plan this week's long run route", category: "health", priority: "low", estimatedMinutes: 15, goalId: goalRun.id }, 3),
    t({ title: "Water the plants", category: "home", priority: "low", estimatedMinutes: 10, dueDate: today, recurrence: "daily" }, 10),
  ];

  // Completed history over the last two weeks: [title, category, daysAgo, minute, minutes, dueOffsetFromCompletion]
  const history: Array<[string, Task["category"], number, number, number, number | null, Task["priority"]]> = [
    ["Outline case study structure", "work", 13, 600, 45, 0, "high"],
    ["Reply to landlord about the boiler", "home", 13, 840, 10, null, "medium"],
    ["5 km easy run", "health", 12, 1080, 35, null, "medium"],
    ["Submit expense report", "finance", 11, 660, 20, 1, "high"],
    ["Fix navbar overflow bug on mobile", "work", 11, 900, 60, 0, "high"],
    ["Meal prep for the week", "home", 10, 1020, 90, null, "medium"],
    ["Call the bank about the new card", "finance", 9, 720, 15, -1, "medium"],
    ["Sketch onboarding flow variations", "work", 8, 630, 90, 2, "medium"],
    ["Read chapter 3 of Deep Work", "study", 8, 1260, 40, null, "low"],
    ["Interview prep: portfolio walkthrough", "work", 7, 960, 60, 0, "urgent"],
    ["Weekly review and planning", "personal", 6, 600, 30, 0, "medium"],
    ["Order new running shoes", "errands", 6, 780, 15, null, "low"],
    ["Team retro notes", "work", 5, 1000, 30, 0, "medium"],
    ["Stretching and mobility", "health", 4, 450, 20, null, "low"],
    ["Pay phone bill", "finance", 4, 700, 5, -2, "high"],
    ["Draft project brief for the client", "work", 3, 610, 75, 1, "high"],
    ["Clean the kitchen", "home", 2, 1140, 40, null, "low"],
    ["Write user interview questions", "work", 2, 660, 45, 0, "medium"],
    ["Renew library books", "errands", 1, 760, 10, 0, "low"],
    ["Collect research notes into one doc", "work", 1, 600, 50, 1, "medium"],
  ];
  const done: Task[] = history.map(([title, category, daysAgo, minute, minutes, dueOffset, priority]) => {
    const completedAt = at(-daysAgo, minute + minutes);
    return t({
      title, category, priority, estimatedMinutes: minutes, status: "done", completedAt, updatedAt: completedAt,
      createdAt: at(-daysAgo - 2, 540),
      dueDate: dueOffset === null ? null : addDays(today, -daysAgo + dueOffset),
      goalId: title.startsWith("Outline case") || title.startsWith("Interview prep") ? goalDesign.id : title.includes("run") ? goalRun.id : null,
    });
  });

  const tasks = [...done, ...open];

  const focusSessions: FocusSession[] = [];
  history.forEach(([, , daysAgo, minute, minutes], i) => {
    if (minutes < 30) return;
    const planned = minutes >= 50 ? 50 : 25;
    const focused = i % 5 === 3 ? Math.round(planned * 0.6) : planned;
    focusSessions.push({
      id: makeId(), taskId: done[i].id, startedAt: at(-daysAgo, minute), endedAt: at(-daysAgo, minute + focused),
      plannedMinutes: planned, focusedMinutes: focused, completed: focused === planned,
    });
  });

  const habits: Habit[] = [
    { id: makeId(), title: "Read for 20 minutes", targetPerWeek: 5, archived: false, createdAt: at(-30, 600) },
    { id: makeId(), title: "Morning stretch", targetPerWeek: 7, archived: false, createdAt: at(-30, 600) },
    { id: makeId(), title: "No phone after 10 PM", targetPerWeek: 4, archived: false, createdAt: at(-30, 600) },
  ];
  const patterns = [
    [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1],
    [0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0],
  ];
  const habitLogs: HabitLog[] = [];
  habits.forEach((h, hi) => {
    patterns[hi].forEach((on, i) => {
      if (on) habitLogs.push({ id: makeId(), habitId: h.id, date: addDays(today, i - 14) });
    });
  });

  const activity: ActivityEvent[] = [
    ...done.flatMap((task): ActivityEvent[] => [
      { id: makeId(), type: "task_created", taskId: task.id, title: task.title, at: task.createdAt },
      { id: makeId(), type: "task_completed", taskId: task.id, title: task.title, at: task.completedAt! },
    ]),
    ...open.map((task): ActivityEvent => ({ id: makeId(), type: "task_created", taskId: task.id, title: task.title, at: task.createdAt })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const event = (date: string, start: string, end: string, title: string): ScheduleBlock => ({
    id: makeId(), date, startMin: toMinutes(start), endMin: toMinutes(end), kind: "event", taskId: null, title,
    locked: true, source: "manual",
  });
  const events: ScheduleBlock[] = [
    event(today, "10:00", "10:15", "Team standup"),
    event(today, "12:30", "13:30", "Lunch with Sam"),
    event(addDays(today, 1), "10:00", "10:15", "Team standup"),
    event(addDays(today, 1), "14:00", "15:00", "Design critique"),
    event(addDays(today, 2), "09:30", "10:30", "1:1 with manager"),
  ];

  const plan = planDay({
    date: today, nowMin, profile, tasks, fixedBlocks: events.filter((e) => e.date === today), newId: makeId,
  });

  return {
    profile,
    tasks,
    blocks: [...events, ...plan.blocks],
    focusSessions,
    goals: [goalDesign, goalRun],
    habits,
    habitLogs,
    activity,
  };
}
