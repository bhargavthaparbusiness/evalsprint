import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli/main.js";
import type { ComparisonResult, RunResult } from "../src/core/types.js";

let dir: string;
let out: string[];
let err: string[];
const io = () => ({ stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t), cwd: dir, color: false });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "evalsprint-cli-"));
  out = [];
  err = [];
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("CLI", () => {
  it("init writes a valid sample suite and refuses to overwrite without --force", async () => {
    expect(await runCli(["init"], io())).toBe(0);
    const suite = JSON.parse(await readFile(path.join(dir, "evalsprint.suite.json"), "utf8")) as { name: string };
    expect(suite.name).toBe("Support ticket summarizer");
    expect(await runCli(["init"], io())).toBe(2);
    expect(err.join()).toContain("already exists");
    expect(await runCli(["init", "--force"], io())).toBe(0);
    expect(await runCli(["validate", "evalsprint.suite.json"], io())).toBe(0);
  });

  it("run prints a report and exits 1 when a test fails", async () => {
    await runCli(["init"], io());
    out = [];
    expect(await runCli(["run", "evalsprint.suite.json"], io())).toBe(1);
    const report = out.join("\n");
    expect(report).toContain("FAIL  Login outage is P1");
    expect(report).toContain('✗ does not contain "we will refund"');
    expect(report).toContain("1/4 passed (25%)");
  });

  it("run --json emits a RunResult and exits 0 when everything passes", async () => {
    const suite = {
      name: "tiny",
      prompts: [{ id: "p", name: "P", template: "Say {{w}}" }],
      cases: [{ id: "c", name: "C", vars: { w: "hi" }, assertions: [{ type: "equals", value: "hi" }], mockResponses: { default: "hi" } }],
    };
    await writeFile(path.join(dir, "tiny.json"), JSON.stringify(suite));
    expect(await runCli(["run", "tiny.json", "--json"], io())).toBe(0);
    const run = JSON.parse(out.join("")) as RunResult;
    expect(run.summary.passRate).toBe(1);
  });

  it("compare reports fixes and regressions", async () => {
    await runCli(["init"], io());
    out = [];
    await runCli(["compare", "evalsprint.suite.json", "--a", "baseline", "--b", "structured", "--json"], io());
    const cmp = JSON.parse(out.join("")) as ComparisonResult;
    expect(cmp.passRateDelta).toBeCloseTo(0.5);
  });

  it("reports configuration errors with exit code 2", async () => {
    await writeFile(path.join(dir, "bad.json"), JSON.stringify({ name: "x", prompts: [], cases: [] }));
    expect(await runCli(["run", "bad.json"], io())).toBe(2);
    expect(err.join()).toContain("prompts: a suite needs at least one prompt version");
    expect(await runCli(["run", "missing.json"], io())).toBe(2);
    expect(await runCli(["run", "bad.json", "--provider", "openai"], io())).toBe(2);
    expect(await runCli(["frobnicate"], io())).toBe(2);
    await runCli(["init"], io());
    expect(await runCli(["run", "evalsprint.suite.json", "--prompt", "nope"], io())).toBe(2);
    expect(err.join()).toContain('Unknown prompt version "nope"');
  });
});
