import "server-only";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

export { AIError, type AIProvider } from "./types";


export function getAIProvider(): AIProvider | null {
  const preferred = process.env.AI_PROVIDER?.toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const anthropic = () =>
    anthropicKey ? createAnthropicProvider(anthropicKey, process.env.ANTHROPIC_MODEL || "claude-opus-5-5") : null;
  const openai = () => (openaiKey ? createOpenAIProvider(openaiKey, process.env.OPENAI_MODEL || "gpt-5-mini") : null);

  if (preferred === "openai") return openai();
  if (preferred === "anthropic") return anthropic();
  return anthropic() ?? openai();
}

export function describeAIProvider(): { name: string; model: string } | null {
  const p = getAIProvider();
  return p ? { name: p.name, model: p.model } : null;
}
