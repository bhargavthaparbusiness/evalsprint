import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleSuite } from "../src/core/sample.js";
import type { ProviderInfo } from "../src/core/types.js";
import { createApiHandler } from "../src/server/api.js";

// Mirrors the options used by the public Vercel adapter (api/_handler.js).
let server: Server;
let base: string;
const REASON = "Disabled on this public demo deployment.";

beforeAll(async () => {
  const handleApi = createApiHandler({
    // A key is present, but the hosted mode must still refuse real calls.
    env: { ANTHROPIC_API_KEY: "sk-should-never-be-used" },
    maxBodyBytes: 200_000,
    maxCases: 5,
    regexTimeoutMs: 50,
    regexBudgetMs: 200,
    anthropicDisabledReason: REASON,
  });
  server = createServer((req, res) => void handleApi(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("hosted (public demo) API mode", () => {
  it("reports Anthropic as unavailable even when a key is set", async () => {
    const { providers } = (await (await fetch(`${base}/api/providers`)).json()) as { providers: ProviderInfo[] };
    expect(providers.find((p) => p.id === "anthropic")).toMatchObject({ available: false, note: REASON });
    expect(JSON.stringify(providers)).not.toContain("sk-should-never-be-used");
  });

  it("refuses Anthropic runs and comparisons", async () => {
    const run = await post("/api/run", { suite: sampleSuite, promptId: "baseline", provider: "anthropic" });
    expect(run.status).toBe(400);
    expect(((await run.json()) as { error: string }).error).toBe(REASON);
    const cmp = await post("/api/compare", { suite: sampleSuite, promptA: "baseline", promptB: "structured", provider: "anthropic" });
    expect(cmp.status).toBe(400);
  });

  it("still runs the mock demo", async () => {
    const res = await post("/api/run", { suite: sampleSuite, promptId: "structured", provider: "mock" });
    expect(res.status).toBe(200);
  });

  it("enforces case and body limits", async () => {
    const many = { ...sampleSuite, cases: [...sampleSuite.cases, ...sampleSuite.cases.map((c) => ({ ...c, id: `${c.id}-2` }))] };
    const res = await post("/api/run", { suite: many, promptId: "baseline", provider: "mock" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("at most 5 test cases");
    const big = { ...sampleSuite, description: "x".repeat(250_000) };
    expect((await post("/api/run", { suite: big, promptId: "baseline", provider: "mock" })).status).toBe(413);
  });
});
