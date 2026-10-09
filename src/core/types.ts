import type { z } from "zod";
import type {
  assertionSchema,
  promptVersionSchema,
  providerIdSchema,
  suiteSchema,
  testCaseSchema,
} from "./schema.js";

export type Assertion = z.infer<typeof assertionSchema>;
export type AssertionType = Assertion["type"];
export type PromptVersion = z.infer<typeof promptVersionSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type Suite = z.infer<typeof suiteSchema>;
export type ProviderId = z.infer<typeof providerIdSchema>;

export interface RenderedPrompt {
  system?: string;
  user: string;
}

/** Token usage, present only when the provider actually reported it. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  /** Human-readable explanation of why the assertion passed or failed. */
  message: string;
}

export type CaseStatus = "pass" | "fail" | "error";

export interface CaseResult {
  caseId: string;
  caseName: string;
  status: CaseStatus;
  vars: Record<string, string>;
  rendered?: RenderedPrompt;
  output?: string;
  /** Set when the case could not be evaluated (render or provider error). */
  error?: string;
  assertions: AssertionResult[];
  /** Wall-clock time of the provider call in milliseconds. */
  latencyMs?: number;
  usage?: TokenUsage;
  /** Model reported by the provider for this response, if any. */
  model?: string;
  /** Provider stop reason, e.g. "end_turn" or "max_tokens". */
  stopReason?: string;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  /** passed / total, between 0 and 1. */
  passRate: number;
  durationMs: number;
  /** Summed token usage across cases that reported usage. */
  usage?: TokenUsage;
}

export interface RunResult {
  suiteName: string;
  promptId: string;
  promptName: string;
  provider: ProviderId;
  model?: string;
  startedAt: string;
  summary: RunSummary;
  results: CaseResult[];
}

export type CaseChange = "fixed" | "regressed" | "unchanged";

export interface ComparisonRow {
  caseId: string;
  caseName: string;
  a: CaseStatus;
  b: CaseStatus;
  change: CaseChange;
}

export interface ComparisonResult {
  a: RunResult;
  b: RunResult;
  rows: ComparisonRow[];
  /** b.passRate - a.passRate, between -1 and 1. */
  passRateDelta: number;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  available: boolean;
  /** Why the provider is unavailable, or a note about how it behaves. */
  note: string;
  defaultModel?: string;
}
