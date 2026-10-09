import { describe, expect, it } from "vitest";
import { MockProvider, resolveMockResponse } from "../src/core/providers/mock.js";
import { ProviderError } from "../src/core/providers/types.js";
import type { TestCase } from "../src/core/types.js";

const testCase = (mockResponses?: Record<string, string>): TestCase => ({
  id: "c",
  name: "C",
  vars: {},
  assertions: [{ type: "contains", value: "x" }],
  ...(mockResponses ? { mockResponses } : {}),
});

describe("MockProvider", () => {
  const provider = new MockProvider();
  const request = (tc: TestCase, promptId = "v1") => ({ prompt: { user: "Hello prompt" }, promptId, testCase: tc });

  it("prefers the fixture for the prompt version", async () => {
    const res = await provider.complete(request(testCase({ v1: "one", default: "dflt" })));
    expect(res.text).toBe("one");
  });

  it("falls back to the default fixture", async () => {
    expect((await provider.complete(request(testCase({ default: "dflt" }), "v2"))).text).toBe("dflt");
  });

  it("echoes the rendered prompt, labelled, when no fixture exists", async () => {
    expect(resolveMockResponse(request(testCase()))).toBe("[mock echo — no fixture defined] Hello prompt");
  });

  it("is deterministic and reports no token usage", async () => {
    const a = await provider.complete(request(testCase({ v1: "same" })));
    const b = await provider.complete(request(testCase({ v1: "same" })));
    expect(a).toEqual(b);
    expect(a.usage).toBeUndefined();
  });

  it("simulates provider errors via the !error: prefix", async () => {
    await expect(provider.complete(request(testCase({ v1: "!error: rate limited" })))).rejects.toThrow(
      new ProviderError("Simulated provider error (mock fixture): rate limited"),
    );
  });
});
