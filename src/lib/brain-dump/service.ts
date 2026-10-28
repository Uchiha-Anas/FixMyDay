import { AIError, type AIProvider } from "../ai/types";
import { BRAIN_DUMP_SYSTEM, buildBrainDumpPrompt } from "../ai/prompts";
import { parseBrainDump } from "./heuristic";
import {
  MODEL_OUTPUT_JSON_SCHEMA,
  normalizeModelTasks,
  type BrainDumpRequest,
  type BrainDumpResponse,
} from "./schema";

/**
 * Parse a brain dump with the configured AI provider, falling back to the
 * deterministic parser whenever AI is unavailable, refuses, times out or
 * returns something that fails validation. Never throws for AI problems.
 */
export async function runBrainDump(
  req: BrainDumpRequest,
  provider: AIProvider | null,
): Promise<BrainDumpResponse> {
  if (!provider) {
    return {
      source: "demo",
      provider: null,
      tasks: parseBrainDump(req.text, req.today),
      notice: "AI isn't configured, so the built-in demo parser organized this. Review the details before saving.",
    };
  }

  try {
    const raw = await provider.generateJSON({
      system: BRAIN_DUMP_SYSTEM,
      prompt: buildBrainDumpPrompt(req),
      schema: MODEL_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "task_extraction",
      maxTokens: 4000,
    });
    const tasks = normalizeModelTasks(raw, req.today);
    return {
      source: "ai",
      provider: `${provider.name} · ${provider.model}`,
      tasks,
      notice: tasks.length === 0 ? "No actionable tasks were found in that text." : null,
    };
  } catch (error) {
    const reason =
      error instanceof AIError
        ? error.message
        : error instanceof Error && error.message.includes("task list")
          ? "The AI response didn't match the expected format."
          : "The AI request failed.";
    if (!(error instanceof AIError)) console.error("[brain-dump] unexpected AI failure", error);
    return {
      source: "fallback",
      provider: `${provider.name} · ${provider.model}`,
      tasks: parseBrainDump(req.text, req.today),
      notice: `${reason} The built-in parser was used instead, so double-check the details.`,
    };
  }
}
