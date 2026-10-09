import type { ProviderId, RenderedPrompt, TestCase, TokenUsage } from "../types.js";

export interface CompletionRequest {
  prompt: RenderedPrompt;
  promptId: string;
  testCase: TestCase;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompletionResponse {
  text: string;
  /** Only set when the provider actually reported usage. */
  usage?: TokenUsage;
  /** Model that served the response, as reported by the provider. */
  model?: string;
  stopReason?: string;
}

export interface Provider {
  readonly id: ProviderId;
  readonly defaultModel?: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/** An expected, user-facing provider failure (bad key, rate limit, refusal, …). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
