import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AIError, AI_TIMEOUT_MS, type AIProvider } from "./types";

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export function createAnthropicProvider(apiKey: string, model: string): AIProvider {
  const client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });

  return {
    name: "Anthropic",
    model,
    async generateJSON({ system, prompt, schema, maxTokens }) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        const useFallbacks = FALLBACK_MODELS.has(model);
        response = await client.beta.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
          // Extraction is a simple task: low effort keeps latency and cost down.
          output_config: { effort: "low", format: { type: "json_schema", schema } },
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          throw new AIError("rate_limited", "The AI provider is rate limiting requests. Try again shortly.");
        }
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          throw new AIError("timeout", "The AI provider took too long to respond.");
        }
        if (error instanceof Anthropic.AuthenticationError) {
          throw new AIError("not_configured", "The Anthropic API key was rejected.");
        }
        if (error instanceof Anthropic.APIError) {
          throw new AIError("upstream", `Anthropic API error (${error.status ?? "network"}).`);
        }
        throw error;
      }

      if (response.stop_reason === "refusal") {
        throw new AIError("refused", "The model declined to process this text.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new AIError("invalid_output", "The response was cut off. Try a shorter brain dump.");
      }
      const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
      if (!text) throw new AIError("invalid_output", "The model returned no text.");
      try {
        return JSON.parse(text.text) as unknown;
      } catch {
        throw new AIError("invalid_output", "The model returned malformed JSON.");
      }
    },
  };
}
