import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockProvider } from "../src/core/providers/mock.js";
import { createProvider } from "../src/core/providers/index.js";
import { sampleSuite } from "../src/core/sample.js";
import type { ComparisonResult, RunResult } from "../src/core/types.js";
import { createApiHandler } from "../src/server/api.js";

let server: Server;
let base: string;

beforeAll(async () => {
  // Empty env: the Anthropic provider must report itself unavailable.
  const handleApi = createApiHandler({
    env: {},
    providerFactory: (id) => (id === "mock" ? new MockProvider() : createProviderWithoutKey()),
  });
  server = createServer((req, res) => {
    void handleApi(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function createProviderWithoutKey() {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    return createProvider("anthropic");
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("HTTP API", () => {
  it("lists providers", async () => {
    const res = await fetch(`${base}/api/providers`);
    const body = (await res.json()) as { providers: { id: string; available: boolean }[] };
    expect(body.providers.map((p) => [p.id, p.available])).toEqual([
      ["mock", true],
      ["anthropic", false],
    ]);
  });

  it("runs a suite with the mock provider", async () => {
    const res = await post("/api/run", { suite: sampleSuite, promptId: "structured", provider: "mock" });
    expect(res.status).toBe(200);
    const run = (await res.json()) as RunResult;
    expect(run.summary).toMatchObject({ total: 4, passed: 3, failed: 1 });
  });

  it("compares two prompt versions", async () => {
    const res = await post("/api/compare", {
      suite: sampleSuite,
      promptA: "baseline",
      promptB: "structured",
      provider: "mock",
    });
    const cmp = (await res.json()) as ComparisonResult;
    expect(res.status).toBe(200);
    expect(cmp.rows.filter((r) => r.change === "regressed").map((r) => r.caseId)).toEqual(["feature-request"]);
  });

  it("returns validation details for an invalid suite", async () => {
    const res = await post("/api/run", { suite: { name: "x", prompts: [], cases: [] }, promptId: "a", provider: "mock" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe("Invalid request");
    expect(body.details).toContain("suite.prompts: a suite needs at least one prompt version");
  });

  it("explains a missing Anthropic key", async () => {
    const res = await post("/api/run", { suite: sampleSuite, promptId: "baseline", provider: "anthropic" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/ANTHROPIC_API_KEY is not set/);
  });

  it("rejects unknown prompt ids, bad JSON, wrong content types and cross-origin posts", async () => {
    const unknown = await post("/api/run", { suite: sampleSuite, promptId: "nope", provider: "mock" });
    expect(unknown.status).toBe(400);
    expect((await post("/api/run", "{oops")).status).toBe(400);
    expect((await post("/api/run", "{}", { "Content-Type": "text/plain" })).status).toBe(415);
    const cross = await post(
      "/api/run",
      { suite: sampleSuite, promptId: "baseline", provider: "mock" },
      { Origin: "https://evil.example" },
    );
    expect(cross.status).toBe(403);
  });

  it("returns 404/405 for unknown routes and methods", async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/run`)).status).toBe(405);
  });
});
