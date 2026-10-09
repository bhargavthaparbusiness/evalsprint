import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/core/providers/mock.js";
import type { CompletionRequest, CompletionResponse, Provider } from "../src/core/providers/types.js";
import { ProviderError } from "../src/core/providers/types.js";
import { compareSuite, EvalConfigError, runSuite } from "../src/core/runner.js";
import { sampleSuite } from "../src/core/sample.js";
import type { Suite } from "../src/core/types.js";

describe("runSuite with the sample suite and mock provider", () => {
  it("produces per-case pass/fail results with reasons", async () => {
    const run = await runSuite(sampleSuite, { provider: new MockProvider(), promptId: "baseline" });
    expect(run.promptName).toBe("v1 — baseline");
    expect(run.provider).toBe("mock");
    expect(run.model).toBeUndefined();
    expect(run.summary).toMatchObject({ total: 4, passed: 1, failed: 3, errored: 0, passRate: 0.25 });
    expect(run.summary.usage).toBeUndefined();
    expect(run.results.map((r) => r.caseId)).toEqual(sampleSuite.cases.map((c) => c.id));

    const refund = run.results.find((r) => r.caseId === "refund-request");
    expect(refund?.status).toBe("fail");
    const failing = refund?.assertions.filter((a) => !a.passed).map((a) => a.message);
    expect(failing).toEqual([
      'Failed: contains "T-1002" — substring not found in output',
      'Failed: does not contain "we will refund" — forbidden substring found at position 45',
      "Failed: matches /\\bP[23]\\b/ — no match in output",
    ]);
  });

  it("defaults to the first prompt version", async () => {
    const run = await runSuite(sampleSuite, { provider: new MockProvider() });
    expect(run.promptId).toBe("baseline");
  });

  it("rejects an unknown prompt id", async () => {
    await expect(runSuite(sampleSuite, { provider: new MockProvider(), promptId: "nope" })).rejects.toThrow(
      EvalConfigError,
    );
  });
});

describe("error handling", () => {
  const suite: Suite = {
    version: 1,
    name: "errors",
    prompts: [{ id: "p", name: "P", template: "Hello {{name}}" }],
    cases: [
      { id: "missing-var", name: "Missing var", vars: {}, assertions: [{ type: "contains", value: "x" }] },
      {
        id: "provider-error",
        name: "Provider error",
        vars: { name: "a" },
        assertions: [{ type: "contains", value: "x" }],
        mockResponses: { default: "!error: boom" },
      },
      {
        id: "ok",
        name: "OK",
        vars: { name: "a" },
        assertions: [{ type: "contains", value: "x" }],
        mockResponses: { default: "x" },
      },
    ],
  };

  it("records render and provider errors per case without aborting the run", async () => {
    const run = await runSuite(suite, { provider: new MockProvider() });
    expect(run.results.map((r) => r.status)).toEqual(["error", "error", "pass"]);
    expect(run.results[0]?.error).toBe("Missing template variable: name");
    expect(run.results[0]?.rendered).toBeUndefined();
    expect(run.results[1]?.error).toBe("Simulated provider error (mock fixture): boom");
    expect(run.results[1]?.rendered).toEqual({ user: "Hello a" });
    expect(run.summary).toMatchObject({ total: 3, passed: 1, failed: 0, errored: 2 });
  });

  it("captures non-ProviderError exceptions thrown by a provider", async () => {
    const throwing: Provider = {
      id: "anthropic",
      complete: () => Promise.reject(new TypeError("socket hang up")),
    };
    const run = await runSuite(suite, { provider: throwing, model: "m" });
    expect(run.results[2]).toMatchObject({ status: "error", error: "socket hang up" });
  });
});

describe("provider integration contract", () => {
  it("passes model, maxTokens and rendered prompts; aggregates reported usage; respects concurrency", async () => {
    const seen: CompletionRequest[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const fake: Provider = {
      id: "anthropic",
      defaultModel: "default-model",
      async complete(req): Promise<CompletionResponse> {
        seen.push(req);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { text: `[T-100${seen.length}] P1`, usage: { inputTokens: 10, outputTokens: 5 }, model: "served" };
      },
    };
    const suite: Suite = { ...sampleSuite, settings: { model: "suite-model", maxTokens: 256 } };
    const run = await runSuite(suite, { provider: fake, promptId: "structured", concurrency: 2 });

    expect(maxInFlight).toBe(2);
    expect(run.model).toBe("suite-model");
    expect(seen[0]?.model).toBe("suite-model");
    expect(seen[0]?.maxTokens).toBe(256);
    expect(seen[0]?.prompt.system).toBe("You are a support triage assistant. Be concise and factual.");
    expect(seen[0]?.prompt.user).toContain("Ticket T-1001:");
    expect(run.summary.usage).toEqual({ inputTokens: 40, outputTokens: 20 });
    expect(run.results[0]?.model).toBe("served");
  });

  it("an explicit model overrides suite settings, which override the provider default", async () => {
    const models: (string | undefined)[] = [];
    const fake: Provider = {
      id: "anthropic",
      defaultModel: "default-model",
      complete: (req) => {
        models.push(req.model);
        return Promise.resolve({ text: "" });
      },
    };
    await runSuite(sampleSuite, { provider: fake, model: "explicit" });
    await runSuite(sampleSuite, { provider: fake });
    expect(new Set(models)).toEqual(new Set(["explicit", "default-model"]));
  });

  it("records a provider-reported error as a failure reason", async () => {
    const fake: Provider = { id: "anthropic", complete: () => Promise.reject(new ProviderError("429 slow down")) };
    const run = await runSuite(sampleSuite, { provider: fake, model: "m" });
    expect(run.summary.errored).toBe(4);
    expect(run.results.every((r) => r.error === "429 slow down")).toBe(true);
  });
});

describe("compareSuite", () => {
  it("runs both prompt versions and labels fixes and regressions", async () => {
    const cmp = await compareSuite(sampleSuite, "baseline", "structured", { provider: new MockProvider() });
    expect(cmp.a.summary.passRate).toBe(0.25);
    expect(cmp.b.summary.passRate).toBe(0.75);
    expect(cmp.passRateDelta).toBeCloseTo(0.5);
    expect(Object.fromEntries(cmp.rows.map((r) => [r.caseId, r.change]))).toEqual({
      "login-outage": "fixed",
      "refund-request": "fixed",
      "feature-request": "regressed",
      "vague-ticket": "fixed",
    });
  });

  it("rejects comparing a prompt with itself or an unknown prompt before running", async () => {
    let calls = 0;
    const counting: Provider = { id: "mock", complete: () => (calls++, Promise.resolve({ text: "" })) };
    await expect(compareSuite(sampleSuite, "baseline", "baseline", { provider: counting })).rejects.toThrow(
      EvalConfigError,
    );
    await expect(compareSuite(sampleSuite, "baseline", "missing", { provider: counting })).rejects.toThrow(
      /Unknown prompt version "missing"/,
    );
    expect(calls).toBe(0);
  });
});
