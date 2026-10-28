export type AIErrorCode = "not_configured" | "rate_limited" | "timeout" | "refused" | "invalid_output" | "upstream";

export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export interface GenerateJSONInput {
  system: string;
  prompt: string;
  /** JSON Schema the response must follow (structured output). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
}

/**
 * Minimal provider abstraction: the app only ever needs "return JSON matching
 * this schema". Callers must still validate the result; it is untrusted.
 */
export interface AIProvider {
  name: string;
  model: string;
  generateJSON(input: GenerateJSONInput): Promise<unknown>;
}

export const AI_TIMEOUT_MS = 30_000;
