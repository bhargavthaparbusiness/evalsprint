import type { CaseResult, ComparisonResult, RunResult } from "../core/types.js";

export interface Colors {
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

export function makeColors(enabled: boolean): Colors {
  const wrap = (open: number, close: number) => (s: string) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return { green: wrap(32, 39), red: wrap(31, 39), yellow: wrap(33, 39), dim: wrap(2, 22), bold: wrap(1, 22) };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function statusMark(result: CaseResult, c: Colors): string {
  if (result.status === "pass") return c.green("PASS");
  if (result.status === "fail") return c.red("FAIL");
  return c.yellow("ERR ");
}

export function formatRun(run: RunResult, c: Colors): string {
  const lines: string[] = [];
  const target = run.provider === "mock" ? "mock provider (fixtures)" : `${run.provider} · ${run.model ?? "default model"}`;
  lines.push(c.bold(`${run.suiteName} — ${run.promptName}`) + c.dim(`  [${target}]`));
  lines.push("");
  for (const result of run.results) {
    const meta = [
      result.latencyMs !== undefined ? `${result.latencyMs}ms` : undefined,
      result.usage ? `${result.usage.inputTokens}→${result.usage.outputTokens} tok` : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(`  ${statusMark(result, c)}  ${result.caseName} ${c.dim(`(${result.caseId}${meta ? `, ${meta}` : ""})`)}`);
    if (result.error) lines.push(`        ${c.yellow(result.error)}`);
    for (const assertion of result.assertions) {
      if (!assertion.passed) lines.push(`        ${c.red("✗")} ${assertion.message.replace(/^Failed: /, "")}`);
    }
    if (result.status === "fail" && result.output !== undefined) {
      const output = result.output.length > 200 ? `${result.output.slice(0, 200)}…` : result.output;
      lines.push(c.dim(`        output: ${JSON.stringify(output)}`));
    }
  }
  const s = run.summary;
  lines.push("");
  lines.push(
    `  ${c.bold(`${s.passed}/${s.total} passed`)} (${pct(s.passRate)})` +
      `  ${s.failed} failed  ${s.errored} errored  ${s.durationMs}ms` +
      (s.usage ? `  ${s.usage.inputTokens} input / ${s.usage.outputTokens} output tokens` : ""),
  );
  return lines.join("\n");
}

export function formatComparison(cmp: ComparisonResult, c: Colors): string {
  const lines: string[] = [];
  lines.push(c.bold(`Compare: ${cmp.a.promptName}  vs  ${cmp.b.promptName}`));
  lines.push("");
  const width = Math.max(...cmp.rows.map((r) => r.caseName.length), 4);
  for (const row of cmp.rows) {
    const change =
      row.change === "fixed" ? c.green("fixed") : row.change === "regressed" ? c.red("regressed") : c.dim("unchanged");
    lines.push(`  ${row.caseName.padEnd(width)}  ${row.a.padEnd(5)} → ${row.b.padEnd(5)}  ${change}`);
  }
  const delta = Math.round(cmp.passRateDelta * 100);
  const deltaText = delta > 0 ? c.green(`+${delta} pts`) : delta < 0 ? c.red(`${delta} pts`) : c.dim("±0 pts");
  lines.push("");
  lines.push(`  A ${cmp.a.promptId}: ${cmp.a.summary.passed}/${cmp.a.summary.total} (${pct(cmp.a.summary.passRate)})`);
  lines.push(`  B ${cmp.b.promptId}: ${cmp.b.summary.passed}/${cmp.b.summary.total} (${pct(cmp.b.summary.passRate)})  ${deltaText}`);
  return lines.join("\n");
}
