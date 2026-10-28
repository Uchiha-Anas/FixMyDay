import { describe, expect, it } from "vitest";
import { parseBrainDump, splitFragments } from "./heuristic";
import { normalizeModelTasks } from "./schema";

const today = "2026-10-28"; // Wednesday

describe("heuristic brain-dump parser", () => {
  it("parses the canonical example into four sensible tasks", () => {
    const tasks = parseBrainDump(
      "I have an exam tomorrow, need to finish my portfolio website, go to the gym for an hour, and call my friend tonight.",
      today,
    );
    expect(tasks.map((t) => t.title)).toEqual([
      "Prepare for the exam",
      "Finish my portfolio website",
      "Go to the gym",
      "Call my friend",
    ]);
    const [exam, portfolio, gym, call] = tasks;
    expect(exam).toMatchObject({ dueDate: "2026-10-29", category: "study", priority: "high" });
    expect(portfolio.dueDate).toBeNull(); // never invent deadlines
    expect(gym).toMatchObject({ estimatedMinutes: 60, category: "health", dueDate: null });
    expect(call).toMatchObject({ dueDate: today, preferredTime: "evening", category: "social" });
  });

  it("keeps shopping lists together", () => {
    expect(splitFragments("buy milk, eggs, and bread")).toEqual(["buy milk, eggs, and bread"]);
  });

  it("splits on newlines and bullets", () => {
    const tasks = parseBrainDump("- email Sarah about the invoice\n- pay rent by Friday\n- clean the kitchen", today);
    expect(tasks).toHaveLength(3);
    expect(tasks[1]).toMatchObject({ title: "Pay rent", dueDate: "2026-10-30", category: "finance" });
  });

  it("extracts explicit times only when a day is known", () => {
    const [withDay] = parseBrainDump("submit the report tomorrow at 3pm", today);
    expect(withDay).toMatchObject({ dueDate: "2026-10-29", dueTime: "15:00", preferredTime: "afternoon" });
    const [noDay] = parseBrainDump("call the dentist at 4pm", today);
    expect(noDay.dueDate).toBeNull();
    expect(noDay.dueTime).toBeNull();
    expect(noDay.clarification).toMatch(/no day/);
  });

  it("marks sequential tasks as dependent", () => {
    const tasks = parseBrainDump("write the draft, then send it to Maya", today);
    expect(tasks).toHaveLength(2);
    expect(tasks[1].dependsOn).toEqual([0]);
  });

  it("detects urgency and durations", () => {
    const [t] = parseBrainDump("fix the login bug asap, about 2 hours", today);
    expect(t.priority).toBe("urgent");
    const [t2] = parseBrainDump("read for 45 minutes", today);
    expect(t2.estimatedMinutes).toBe(45);
  });

  it("flags vague timing for clarification", () => {
    const [t] = parseBrainDump("plan the team offsite next week", today);
    expect(t.dueDate).toBeNull();
    expect(t.clarification).toBeTruthy();
    expect(t.confidence).toBeLessThan(0.75);
  });

  it("resolves month-day dates into the future", () => {
    const [t] = parseBrainDump("renew passport by Jan 5", today);
    expect(t.dueDate).toBe("2027-01-05");
  });

  it("returns an empty list for empty input", () => {
    expect(parseBrainDump("   ", today)).toEqual([]);
  });
});

describe("normalizeModelTasks (untrusted AI output)", () => {
  it("accepts well-formed output", () => {
    const out = normalizeModelTasks(
      {
        tasks: [
          {
            title: "Study for exam", description: "", priority: "high", category: "study", estimatedMinutes: 120,
            dueDate: "2026-10-29", dueTime: null, preferredTime: "morning", dependsOn: [], tags: ["exam"],
            confidence: 0.9, clarification: null,
          },
        ],
      },
      today,
    );
    expect(out[0]).toMatchObject({ title: "Study for exam", dueDate: "2026-10-29", priority: "high" });
  });

  it("repairs or drops invalid fields", () => {
    const out = normalizeModelTasks(
      {
        tasks: [
          { title: "", priority: "high" },
          {
            title: "Do it", priority: "EXTREME", category: "space", estimatedMinutes: 99999, dueDate: "tomorrow",
            dueTime: "25:99", preferredTime: "noon", dependsOn: [0, 1, 7, "x"], tags: [1, "ok"], confidence: 5,
            clarification: 42,
          },
          { title: "Past", dueDate: "2020-01-01", dueTime: "10:00" },
        ],
      },
      today,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      title: "Do it", priority: "medium", category: "personal", estimatedMinutes: 720, dueDate: null,
      dueTime: null, preferredTime: "any", dependsOn: [], tags: ["ok"], confidence: 1, clarification: null,
    });
    expect(out[1].dueDate).toBeNull();
    expect(out[1].dueTime).toBeNull();
  });

  it("re-maps dependency indexes after dropping items and breaks cycles", () => {
    const out = normalizeModelTasks(
      { tasks: [{ title: "" }, { title: "A", dependsOn: [2] }, { title: "B", dependsOn: [1] }] },
      today,
    );
    expect(out.map((t) => t.title)).toEqual(["A", "B"]);
    const edges = out.flatMap((t, i) => t.dependsOn.map((d) => `${i}->${d}`));
    expect(edges).toHaveLength(1); // one of the two cyclic edges was removed
  });

  it("throws when the payload has no task list", () => {
    expect(() => normalizeModelTasks({ nope: true }, today)).toThrow();
    expect(() => normalizeModelTasks("garbage", today)).toThrow();
  });
});
