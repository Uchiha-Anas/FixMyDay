import "server-only";
import { AIError, AI_TIMEOUT_MS, type AIProvider } from "./types";

interface ChatCompletion {
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
}

export function createOpenAIProvider(apiKey: string, model: string): AIProvider {
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  return {
    name: "OpenAI",
    model,
    async generateJSON({ system, prompt, schema, schemaName, maxTokens }) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
          body: JSON.stringify({
            model,
            max_completion_tokens: maxTokens,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
          }),
        });
      } catch (error) {
        if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
          throw new AIError("timeout", "The AI provider took too long to respond.");
        }
        throw new AIError("upstream", "Could not reach the OpenAI API.");
      }

      if (res.status === 429) throw new AIError("rate_limited", "The AI provider is rate limiting requests. Try again shortly.");
      if (res.status === 401 || res.status === 403) throw new AIError("not_configured", "The OpenAI API key was rejected.");
      if (!res.ok) throw new AIError("upstream", `OpenAI API error (${res.status}).`);

      const body = (await res.json().catch(() => null)) as ChatCompletion | null;
      const choice = body?.choices?.[0];
      if (choice?.message?.refusal) throw new AIError("refused", "The model declined to process this text.");
      if (choice?.finish_reason === "length") {
        throw new AIError("invalid_output", "The response was cut off. Try a shorter brain dump.");
      }
      const content = choice?.message?.content;
      if (!content) throw new AIError("invalid_output", "The model returned no content.");
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new AIError("invalid_output", "The model returned malformed JSON.");
      }
    },
  };
}
