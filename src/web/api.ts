import type { ComparisonResult, ProviderId, ProviderInfo, RunResult, Suite } from "../core/types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("Could not reach the PitchvioEvals server. Is `npm run dev` (or `npm start`) still running?");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Server returned an unreadable response (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    const err = body as { error?: string; details?: string[] };
    throw new ApiError(err.error ?? `Request failed (HTTP ${res.status})`, err.details ?? []);
  }
  return body as T;
}

const postJson = <T>(path: string, payload: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const api = {
  providers: () => request<{ providers: ProviderInfo[] }>("/api/providers").then((r) => r.providers),
  run: (suite: Suite, promptId: string, provider: ProviderId, model?: string) =>
    postJson<RunResult>("/api/run", { suite, promptId, provider, ...(model ? { model } : {}) }),
  compare: (suite: Suite, promptA: string, promptB: string, provider: ProviderId, model?: string) =>
    postJson<ComparisonResult>("/api/compare", { suite, promptA, promptB, provider, ...(model ? { model } : {}) }),
};
