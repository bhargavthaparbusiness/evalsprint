import type { ProviderId, ProviderInfo } from "../types.js";
import {
  AnthropicProvider,
  ANTHROPIC_API_KEY_ENV,
  hasAnthropicKey,
  resolveDefaultAnthropicModel,
} from "./anthropic.js";
import { MockProvider } from "./mock.js";
import type { Provider } from "./types.js";

export * from "./types.js";
export { MockProvider, MOCK_ERROR_PREFIX, resolveMockResponse } from "./mock.js";
export {
  AnthropicProvider,
  ANTHROPIC_API_KEY_ENV,
  ANTHROPIC_MODEL_ENV,
  DEFAULT_ANTHROPIC_MODEL,
  hasAnthropicKey,
  resolveDefaultAnthropicModel,
} from "./anthropic.js";

/** Creates a provider by id. Throws ProviderError when Anthropic has no key. */
export function createProvider(id: ProviderId): Provider {
  return id === "anthropic" ? new AnthropicProvider() : new MockProvider();
}

/** Describes which providers can run in the current environment (never exposes the key). */
export function describeProviders(env: NodeJS.ProcessEnv = process.env): ProviderInfo[] {
  const keySet = hasAnthropicKey(env);
  return [
    {
      id: "mock",
      label: "Mock",
      available: true,
      note: "Deterministic fixture outputs from the suite. No API key, no cost, no real model.",
    },
    {
      id: "anthropic",
      label: "Anthropic",
      available: keySet,
      note: keySet
        ? "Real model calls using ANTHROPIC_API_KEY from the server environment. Usage is billed to your account."
        : `Set ${ANTHROPIC_API_KEY_ENV} in the server environment (or .env) and restart to enable.`,
      defaultModel: resolveDefaultAnthropicModel(env),
    },
  ];
}
