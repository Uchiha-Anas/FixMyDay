import { describe, expect, it } from "vitest";
import { runBrainDump } from "./service";
import { AIError, type AIProvider } from "../ai/types";

const req = { text: "finish the slides tomorrow and call mom tonight", today: "2026-10-28", nowTime: "10:00", timezone: "UTC" };

function fakeProvider(impl: () => Promise<unknown>): AIProvider {
  return { name: "Fake", model: "fake-1", generateJSON: impl };
}

describe("runBrainDump", () => {
  it("uses the demo parser when no provider is configured", async () => {
    const res = await runBrainDump(req, null);
    expect(res.source).toBe("demo");
    expect(res.tasks.length).toBe(2);
    expect(res.notice).toMatch(/demo parser/);
  });

  it("returns validated AI tasks", async () => {
    const res = await runBrainDump(
      req,
      fakeProvider(async () => ({ tasks: [{ title: "Finish slides", priority: "high", dueDate: "2026-10-29", estimatedMinutes: 90 }] })),
    );
    expect(res.source).toBe("ai");
    expect(res.tasks[0]).toMatchObject({ title: "Finish slides", priority: "high", dueDate: "2026-10-29", estimatedMinutes: 90 });
  });

  it("falls back when the AI returns an invalid shape", async () => {
    const res = await runBrainDump(req, fakeProvider(async () => ({ items: "nope" })));
    expect(res.source).toBe("fallback");
    expect(res.tasks.length).toBe(2);
    expect(res.notice).toMatch(/expected format/);
  });

  it("falls back on provider errors such as rate limits", async () => {
    const res = await runBrainDump(
      req,
      fakeProvider(async () => {
        throw new AIError("rate_limited", "The AI provider is rate limiting requests.");
      }),
    );
    expect(res.source).toBe("fallback");
    expect(res.notice).toMatch(/rate limiting/);
  });

  it("never passes through hallucinated past deadlines", async () => {
    const res = await runBrainDump(req, fakeProvider(async () => ({ tasks: [{ title: "X", dueDate: "2001-01-01" }] })));
    expect(res.tasks[0].dueDate).toBeNull();
  });
});
