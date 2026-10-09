import type { CompletionRequest, CompletionResponse, Provider } from "./types.js";
import { ProviderError } from "./types.js";

/** Fixture prefix that makes the mock provider simulate a provider failure. */
export const MOCK_ERROR_PREFIX = "!error:";

/**
 * Picks the deterministic mock output for a request:
 *   1. `testCase.mockResponses[promptId]`
 *   2. `testCase.mockResponses.default`
 *   3. an echo of the rendered user prompt, clearly labelled as such.
 */
export function resolveMockResponse(request: CompletionRequest): string {
  const fixtures = request.testCase.mockResponses ?? {};
  const fixture = fixtures[request.promptId] ?? fixtures.default;
  if (fixture !== undefined) return fixture;
  return `[mock echo — no fixture defined] ${request.prompt.user}`;
}

/**
 * Deterministic provider for demos, tests and CI. It never calls a model:
 * outputs come from fixtures in the suite file, so results are repeatable
 * and free. It reports no token usage because no tokens are consumed.
 */
export class MockProvider implements Provider {
  readonly id = "mock" as const;

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (request.signal?.aborted) throw new ProviderError("Run was cancelled");
    const text = resolveMockResponse(request);
    if (text.startsWith(MOCK_ERROR_PREFIX)) {
      throw new ProviderError(
        `Simulated provider error (mock fixture): ${text.slice(MOCK_ERROR_PREFIX.length).trim() || "unspecified"}`,
      );
    }
    return { text, stopReason: "mock_fixture" };
  }
}
