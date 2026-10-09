import { evaluateAssertion } from "./assertions.js";
import type { Provider } from "./providers/types.js";
import { ProviderError } from "./providers/types.js";
import { renderPrompt, TemplateError } from "./template.js";
import type {
  CaseResult,
  ComparisonResult,
  ComparisonRow,
  PromptVersion,
  RenderedPrompt,
  RunResult,
  RunSummary,
  Suite,
  TestCase,
  TokenUsage,
} from "./types.js";

export interface RunOptions {
  promptId?: string;
  provider: Provider;
  /** Overrides suite.settings.model and the provider default. */
  model?: string;
  maxTokens?: number;
  /** Maximum provider calls in flight. Defaults to 4. */
  concurrency?: number;
  signal?: AbortSignal;
  onCaseComplete?: (result: CaseResult, index: number) => void;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export class EvalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalConfigError";
  }
}

export function findPrompt(suite: Suite, promptId?: string): PromptVersion {
  if (promptId === undefined) {
    const first = suite.prompts[0];
    if (!first) throw new EvalConfigError("Suite has no prompt versions");
    return first;
  }
  const prompt = suite.prompts.find((p) => p.id === promptId);
  if (!prompt) {
    const known = suite.prompts.map((p) => p.id).join(", ");
    throw new EvalConfigError(`Unknown prompt version "${promptId}". Available: ${known}`);
  }
  return prompt;
}

/** Runs one test case end to end: render → provider call → assertions. Never throws. */
export async function runCase(
  testCase: TestCase,
  prompt: PromptVersion,
  options: Omit<RunOptions, "promptId" | "concurrency" | "onCaseComplete"> & { model?: string },
): Promise<CaseResult> {
  const now = options.now ?? (() => performance.now());
  const base: CaseResult = {
    caseId: testCase.id,
    caseName: testCase.name,
    status: "error",
    vars: testCase.vars,
    assertions: [],
  };

  let rendered: RenderedPrompt;
  try {
    rendered = renderPrompt(prompt, testCase.vars);
  } catch (error) {
    const message = error instanceof TemplateError ? error.message : `Could not render prompt: ${String(error)}`;
    return { ...base, error: message };
  }

  const started = now();
  try {
    const response = await options.provider.complete({
      prompt: rendered,
      promptId: prompt.id,
      testCase,
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const latencyMs = Math.max(0, Math.round(now() - started));
    const assertions = testCase.assertions.map((assertion) => evaluateAssertion(assertion, response.text));
    const result: CaseResult = {
      ...base,
      status: assertions.every((a) => a.passed) ? "pass" : "fail",
      rendered,
      output: response.text,
      assertions,
      latencyMs,
    };
    if (response.usage) result.usage = response.usage;
    if (response.model) result.model = response.model;
    if (response.stopReason) result.stopReason = response.stopReason;
    return result;
  } catch (error) {
    const latencyMs = Math.max(0, Math.round(now() - started));
    const message =
      error instanceof ProviderError || error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
    return { ...base, rendered, error: message, latencyMs };
  }
}

export function summarize(results: CaseResult[], durationMs: number): RunSummary {
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const errored = results.filter((r) => r.status === "error").length;
  const withUsage = results.flatMap((r) => (r.usage ? [r.usage] : []));
  const summary: RunSummary = {
    total: results.length,
    passed,
    failed,
    errored,
    passRate: results.length === 0 ? 0 : passed / results.length,
    durationMs,
  };
  if (withUsage.length > 0) {
    summary.usage = withUsage.reduce<TokenUsage>(
      (sum, u) => ({ inputTokens: sum.inputTokens + u.inputTokens, outputTokens: sum.outputTokens + u.outputTokens }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }
  return summary;
}

/** Runs every case in a suite against one prompt version. Results keep suite order. */
export async function runSuite(suite: Suite, options: RunOptions): Promise<RunResult> {
  const prompt = findPrompt(suite, options.promptId);
  const now = options.now ?? (() => performance.now());
  const model =
    options.provider.id === "mock"
      ? undefined
      : (options.model ?? suite.settings?.model ?? options.provider.defaultModel);
  const maxTokens = options.maxTokens ?? suite.settings?.maxTokens;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 16));
  const startedAt = new Date().toISOString();
  const started = now();

  const results: CaseResult[] = new Array<CaseResult>(suite.cases.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < suite.cases.length) {
      const index = next++;
      const testCase = suite.cases[index];
      if (!testCase) continue;
      const result = await runCase(testCase, prompt, {
        provider: options.provider,
        ...(model !== undefined ? { model } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        now,
      });
      results[index] = result;
      options.onCaseComplete?.(result, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, suite.cases.length) }, worker));

  const run: RunResult = {
    suiteName: suite.name,
    promptId: prompt.id,
    promptName: prompt.name,
    provider: options.provider.id,
    startedAt,
    summary: summarize(results, Math.max(0, Math.round(now() - started))),
    results,
  };
  if (model !== undefined) run.model = model;
  return run;
}

/** Compares two already-completed runs of the same suite case by case. */
export function compareRuns(a: RunResult, b: RunResult): ComparisonResult {
  const bById = new Map(b.results.map((r) => [r.caseId, r]));
  const rows: ComparisonRow[] = a.results.flatMap((ra) => {
    const rb = bById.get(ra.caseId);
    if (!rb) return [];
    const aPass = ra.status === "pass";
    const bPass = rb.status === "pass";
    return [
      {
        caseId: ra.caseId,
        caseName: ra.caseName,
        a: ra.status,
        b: rb.status,
        change: aPass === bPass ? "unchanged" : bPass ? "fixed" : "regressed",
      },
    ];
  });
  return { a, b, rows, passRateDelta: b.summary.passRate - a.summary.passRate };
}

/** Runs two prompt versions against the same cases and compares them. */
export async function compareSuite(
  suite: Suite,
  promptA: string,
  promptB: string,
  options: Omit<RunOptions, "promptId">,
): Promise<ComparisonResult> {
  if (promptA === promptB) throw new EvalConfigError("Choose two different prompt versions to compare");
  // Validate both ids before spending any provider calls.
  findPrompt(suite, promptA);
  findPrompt(suite, promptB);
  const a = await runSuite(suite, { ...options, promptId: promptA });
  const b = await runSuite(suite, { ...options, promptId: promptB });
  return compareRuns(a, b);
}
