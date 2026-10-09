import { describe, expect, it } from "vitest";
import { evaluateAssertion } from "../src/core/assertions.js";
import { MockProvider } from "../src/core/providers/mock.js";
import { createGuardedRegexMatcher, RegexTimeoutError } from "../src/core/regex-guard.js";
import { runSuite } from "../src/core/runner.js";
import { parseSuite } from "../src/core/schema.js";
import type { Suite } from "../src/core/types.js";

const EVIL = "^(a+)+$";
const EVIL_INPUT = `${"a".repeat(40)}b`;

describe("guarded regex matcher", () => {
  it("matches normally", () => {
    const match = createGuardedRegexMatcher(100);
    expect(match("P\\d", "i", "priority p2")).toBe("p2");
    expect(match("x", undefined, "abc")).toBeNull();
  });

  it("interrupts catastrophic backtracking", () => {
    const match = createGuardedRegexMatcher(50);
    const started = Date.now();
    expect(() => match(EVIL, undefined, EVIL_INPUT)).toThrow(RegexTimeoutError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("enforces a total time budget across calls", () => {
    // The per-call limit is capped by the remaining budget, so one slow call spends all of it.
    const match = createGuardedRegexMatcher(100, 30);
    expect(() => match(EVIL, undefined, EVIL_INPUT)).toThrow(/exceeded 30 ms/);
    expect(() => match("a", undefined, "a")).toThrow(/budget of 30 ms for this run is exhausted/);
  });

  it("reports a timeout as a failed assertion instead of throwing", () => {
    const r = evaluateAssertion({ type: "regex", pattern: EVIL }, EVIL_INPUT, {
      matchRegex: createGuardedRegexMatcher(30),
    });
    expect(r.passed).toBe(false);
    expect(r.message).toContain("catastrophic backtracking");
  });

  it("keeps a malicious suite from hanging a run", async () => {
    const suite: Suite = {
      version: 1,
      name: "redos",
      prompts: [{ id: "p", name: "P", template: "x" }],
      cases: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        vars: {},
        assertions: [{ type: "regex" as const, pattern: EVIL }],
        mockResponses: { default: EVIL_INPUT },
      })),
    };
    const started = Date.now();
    const run = await runSuite(suite, { provider: new MockProvider(), regexTimeoutMs: 50, regexBudgetMs: 120 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(run.summary.failed).toBe(10);
  });

  it("rejects overly long patterns at validation time", () => {
    const result = parseSuite({
      name: "s",
      prompts: [{ id: "p", name: "P", template: "t" }],
      cases: [{ id: "c", name: "C", assertions: [{ type: "regex", pattern: "a".repeat(501) }] }],
    });
    expect(result.ok).toBe(false);
  });
});
