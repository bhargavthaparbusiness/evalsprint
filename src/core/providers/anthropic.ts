import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResponse, Provider } from "./types.js";
import { ProviderError } from "./types.js";

export const ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY";
export const ANTHROPIC_MODEL_ENV = "PITCHVIOEVALS_ANTHROPIC_MODEL";
/** Pre-rebrand name, still honoured so existing .env files keep working. */
export const LEGACY_ANTHROPIC_MODEL_ENV = "EVALSPRINT_ANTHROPIC_MODEL";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const DEFAULT_MAX_TOKENS = 16000;

/** Minimal surface of the SDK client we depend on; lets tests inject a fake. */
export interface MessagesClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ): Promise<Anthropic.Message>;
  };
}

export interface AnthropicProviderOptions {
  /** Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  defaultModel?: string;
  client?: MessagesClient;
}

export function hasAnthropicKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[ANTHROPIC_API_KEY_ENV]?.trim());
}

export function resolveDefaultAnthropicModel(env: NodeJS.ProcessEnv = process.env): string {
  return env[ANTHROPIC_MODEL_ENV]?.trim() || env[LEGACY_ANTHROPIC_MODEL_ENV]?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export class AnthropicProvider implements Provider {
  readonly id = "anthropic" as const;
  readonly defaultModel: string;
  private readonly client: MessagesClient;

  constructor(options: AnthropicProviderOptions = {}) {
    this.defaultModel = options.defaultModel ?? resolveDefaultAnthropicModel();
    if (options.client) {
      this.client = options.client;
      return;
    }
    const apiKey = (options.apiKey ?? process.env[ANTHROPIC_API_KEY_ENV])?.trim();
    if (!apiKey) {
      throw new ProviderError(
        `${ANTHROPIC_API_KEY_ENV} is not set. Add it to your environment or a local .env file ` +
          "(see .env.example), then start PitchvioEvals again. The mock provider works without a key.",
      );
    }
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.defaultModel;
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(request.prompt.system ? { system: request.prompt.system } : {}),
          messages: [{ role: "user", content: request.prompt.user }],
        },
        request.signal ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      throw toProviderError(error, model);
    }

    if (response.stop_reason === "refusal") {
      throw new ProviderError(
        `The model declined to respond (stop_reason: refusal${describeRefusal(response)}).`,
      );
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    return {
      text,
      model: response.model,
      stopReason: response.stop_reason ?? undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

function describeRefusal(response: Anthropic.Message): string {
  const details = (response as { stop_details?: { category?: string | null } | null }).stop_details;
  return details?.category ? `, category: ${details.category}` : "";
}

/** Maps SDK errors to short, actionable messages. Most specific classes first. */
export function toProviderError(error: unknown, model: string): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderError(
      `Anthropic rejected the API key (401). Check ${ANTHROPIC_API_KEY_ENV}.`,
      { status: 401 },
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(`Anthropic denied access (403): ${error.message}`, { status: 403 });
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError(
      `Anthropic returned 404 for model "${model}". Check the model id.`,
      { status: 404 },
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError("Anthropic rate limit reached (429). Wait and retry, or lower concurrency.", {
      status: 429,
      retryable: true,
    });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ProviderError(`Anthropic rejected the request (400): ${error.message}`, { status: 400 });
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new ProviderError(`Anthropic server error (${error.status}). Retry later.`, {
      status: error.status,
      retryable: true,
    });
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return new ProviderError("Request was cancelled.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError(`Could not reach the Anthropic API: ${error.message}`, { retryable: true });
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError(`Anthropic API error${error.status ? ` (${error.status})` : ""}: ${error.message}`, {
      status: error.status,
    });
  }
  return new ProviderError(`Unexpected error calling Anthropic: ${(error as Error)?.message ?? String(error)}`);
}
