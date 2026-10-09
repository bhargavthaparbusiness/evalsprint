import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  DEFAULT_ANTHROPIC_MODEL,
  type MessagesClient,
  toProviderError,
} from "../src/core/providers/anthropic.js";
import { describeProviders } from "../src/core/providers/index.js";
import { ProviderError } from "../src/core/providers/types.js";
import type { TestCase } from "../src/core/types.js";

const testCase: TestCase = { id: "c", name: "C", vars: {}, assertions: [{ type: "contains", value: "x" }] };

function fakeClient(respond: (params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message | Error) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      create: (params) => {
        calls.push(params);
        const result = respond(params);
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      },
    },
  };
  return { client, calls };
}

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: [{ type: "text", text: "Hello ", citations: null }, { type: "text", text: "world", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 3 },
    ...overrides,
  } as Anthropic.Message;
}

describe("AnthropicProvider", () => {
  it("throws a clear error when the API key is missing", () => {
    expect(() => new AnthropicProvider({ apiKey: "  " })).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it("sends system + user content and returns text, usage and model as reported", async () => {
    const { client, calls } = fakeClient(() => message());
    const provider = new AnthropicProvider({ client, defaultModel: "default-m" });
    const res = await provider.complete({
      prompt: { system: "sys", user: "hi" },
      promptId: "p",
      testCase,
      maxTokens: 100,
    });
    expect(calls[0]).toEqual({
      model: "default-m",
      max_tokens: 100,
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res).toEqual({
      text: "Hello world",
      model: "claude-test",
      stopReason: "end_turn",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("omits the system field when there is no system prompt", async () => {
    const { client, calls } = fakeClient(() => message());
    await new AnthropicProvider({ client }).complete({ prompt: { user: "hi" }, promptId: "p", testCase, model: "m" });
    expect(calls[0]).not.toHaveProperty("system");
    expect(calls[0]?.model).toBe("m");
  });

  it("treats a refusal as an error", async () => {
    const { client } = fakeClient(() => message({ stop_reason: "refusal" }));
    await expect(
      new AnthropicProvider({ client }).complete({ prompt: { user: "hi" }, promptId: "p", testCase }),
    ).rejects.toThrow(/declined to respond/);
  });

  it("maps SDK errors to actionable messages", async () => {
    const headers = new Headers();
    const notFound = new Anthropic.NotFoundError(404, { type: "error" }, "not found", headers);
    const { client } = fakeClient(() => notFound);
    await expect(
      new AnthropicProvider({ client }).complete({ prompt: { user: "hi" }, promptId: "p", testCase, model: "bad-model" }),
    ).rejects.toThrow('Anthropic returned 404 for model "bad-model". Check the model id.');

    const auth = toProviderError(new Anthropic.AuthenticationError(401, undefined, "bad key", headers), "m");
    expect(auth.message).toMatch(/rejected the API key \(401\)/);
    const rate = toProviderError(new Anthropic.RateLimitError(429, undefined, "slow", headers), "m");
    expect(rate.options).toMatchObject({ status: 429, retryable: true });
    const network = toProviderError(new Anthropic.APIConnectionError({ message: "ECONNRESET" }), "m");
    expect(network.message).toContain("Could not reach the Anthropic API");
    expect(toProviderError(new Error("weird"), "m")).toBeInstanceOf(ProviderError);
  });
});

describe("describeProviders", () => {
  it("reports Anthropic unavailable without a key and never leaks the key", () => {
    const without = describeProviders({});
    expect(without.find((p) => p.id === "anthropic")).toMatchObject({
      available: false,
      defaultModel: DEFAULT_ANTHROPIC_MODEL,
    });
    const withKey = describeProviders({ ANTHROPIC_API_KEY: "sk-secret-value", EVALSPRINT_ANTHROPIC_MODEL: "m2" });
    expect(withKey.find((p) => p.id === "anthropic")).toMatchObject({ available: true, defaultModel: "m2" });
    expect(JSON.stringify(withKey)).not.toContain("sk-secret-value");
  });
});
