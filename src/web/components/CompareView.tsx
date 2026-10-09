import { useState } from "react";
import type { CaseChange, CaseResult, ComparisonResult, RunResult, Suite } from "../../core/types.js";
import type { IconName } from "../design/icons";
import { api, ApiError } from "../api";
import type { RunTarget } from "../App";
import { CaseDetail } from "./CaseDetail";
import { Icon } from "./Icon";
import { EmptyState, formatPercent, Notice, ResultBar, Spinner, StatusIcon } from "./ui";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ComparisonResult; snapshot: string }
  | { status: "error"; message: string; details: string[] };

const CHANGE: Record<CaseChange, { label: string; icon: IconName }> = {
  fixed: { label: "Fixed", icon: "fix" },
  regressed: { label: "Regressed", icon: "regress" },
  unchanged: { label: "Unchanged", icon: "equal" },
};

export function CompareView({ suite, blockedReason, target }: { suite: Suite; blockedReason?: string; target: RunTarget }) {
  const [a, setA] = useState(suite.prompts[0]?.id ?? "");
  const [b, setB] = useState(suite.prompts[1]?.id ?? suite.prompts[0]?.id ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const [open, setOpen] = useState<string | null>(null);

  const ids = suite.prompts.map((p) => p.id);
  const promptA = ids.includes(a) ? a : (ids[0] ?? "");
  const promptB = ids.includes(b) ? b : (ids[1] ?? ids[0] ?? "");

  const disabledReason =
    blockedReason ??
    (suite.prompts.length < 2
      ? "Add a second prompt version in the Prompts tab to compare versions."
      : promptA === promptB
        ? "Choose two different prompt versions."
        : target.blockedReason);

  async function run() {
    setState({ status: "running" });
    try {
      const result = await api.compare(suite, promptA, promptB, target.provider, target.model);
      setState({ status: "done", result, snapshot: JSON.stringify(suite) });
      setOpen(result.rows.find((r) => r.change === "regressed")?.caseId ?? null);
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(String(error));
      setState({ status: "error", message: e.message, details: e.details });
    }
  }

  const running = state.status === "running";

  return (
    <section className="view" aria-labelledby="compare-heading">
      <div className="toolbar">
        <div className="toolbar-title">
          <h2 id="compare-heading">Compare prompt versions</h2>
          <p>Same cases, same assertions — see exactly what a prompt change fixed or broke.</p>
        </div>
        <div className="toolbar-controls compare-controls">
          <label className="inline-field">
            <span className="version-tag">A</span>
            <select value={promptA} onChange={(e) => setA(e.target.value)} disabled={running} aria-label="Version A">
              {suite.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span className="version-tag version-b">B</span>
            <select value={promptB} onChange={(e) => setB(e.target.value)} disabled={running} aria-label="Version B">
              {suite.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary run-btn" onClick={run} disabled={running || Boolean(disabledReason)}>
            {running ? <Spinner /> : <Icon name="compare" />}
            {running ? "Comparing…" : "Run comparison"}
          </button>
        </div>
      </div>

      {disabledReason ? (
        <Notice tone="warn" title="Can't compare yet">
          {disabledReason}
        </Notice>
      ) : null}
      {target.provider === "anthropic" && !disabledReason ? (
        <p className="cost-note">
          <Icon name="info" />
          Makes {suite.cases.length * 2} real API calls ({suite.cases.length} per version) to{" "}
          <code>{target.model || "the default model"}</code>.
        </p>
      ) : null}

      {state.status === "error" ? (
        <Notice tone="error" title={state.message}>
          {state.details.length > 0 ? (
            <ul>
              {state.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {state.status === "idle" ? (
        <EmptyState icon="compare" title="No comparison yet">
          Both versions run against the same {suite.cases.length} test case{suite.cases.length === 1 ? "" : "s"}. Each
          case is marked fixed, regressed or unchanged, with both outputs side by side.
        </EmptyState>
      ) : null}

      {running ? (
        <div className="panel" aria-busy="true" aria-label="Running comparison">
          {suite.cases.slice(0, 8).map((c) => (
            <div key={c.id} className="skeleton-row">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-short" />
            </div>
          ))}
        </div>
      ) : null}

      {state.status === "done" ? (
        <ComparisonResults
          result={state.result}
          stale={state.snapshot !== JSON.stringify(suite)}
          open={open}
          onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
        />
      ) : null}
    </section>
  );
}

function VersionScore({ tag, run }: { tag: "A" | "B"; run: RunResult }) {
  const s = run.summary;
  return (
    <div className="version-score">
      <div className="version-head">
        <span className={`version-tag${tag === "B" ? " version-b" : ""}`}>{tag}</span>
        <span className="version-name">{run.promptName}</span>
      </div>
      <div className="version-rate">{formatPercent(s.passRate)}</div>
      <ResultBar passed={s.passed} failed={s.failed} errored={s.errored} />
      <div className="summary-caption">
        <span className="mono">
          {s.passed}/{s.total}
        </span>{" "}
        passed · {s.failed} failed · {s.errored} errored
      </div>
    </div>
  );
}

function ComparisonResults({
  result,
  stale,
  open,
  onToggle,
}: {
  result: ComparisonResult;
  stale: boolean;
  open: string | null;
  onToggle: (id: string) => void;
}) {
  const delta = Math.round(result.passRateDelta * 100);
  const count = (c: CaseChange) => result.rows.filter((r) => r.change === c).length;
  const byId = (results: CaseResult[], id: string) => results.find((r) => r.caseId === id);
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="results">
      {stale ? <Notice tone="info">The suite changed since this comparison. Run again to refresh.</Notice> : null}

      <div className="compare-summary">
        <VersionScore tag="A" run={result.a} />
        <div className={`delta delta-${tone}`}>
          <Icon name={tone === "down" ? "regress" : tone === "up" ? "fix" : "equal"} />
          <span className="delta-value">
            {delta > 0 ? "+" : ""}
            {delta} pts
          </span>
          <span className="delta-label">A → B</span>
        </div>
        <VersionScore tag="B" run={result.b} />
      </div>

      <div className="change-legend" role="list">
        {(["fixed", "regressed", "unchanged"] as const).map((c) => (
          <span key={c} role="listitem" className={`change-chip change-${c}`}>
            <Icon name={CHANGE[c].icon} />
            <span className="mono">{count(c)}</span> {CHANGE[c].label.toLowerCase()}
          </span>
        ))}
      </div>

      <ul className="result-list">
        {result.rows.map((row) => {
          const ra = byId(result.a.results, row.caseId);
          const rb = byId(result.b.results, row.caseId);
          const isOpen = open === row.caseId;
          const detailId = `cmp-${row.caseId}`;
          return (
            <li key={row.caseId} className={`result-row change-row-${row.change}${isOpen ? " is-open" : ""}`}>
              <button className="row-button" aria-expanded={isOpen} aria-controls={detailId} onClick={() => onToggle(row.caseId)}>
                <span className="row-main">
                  <span className="row-name">{row.caseName}</span>
                  <span className="row-sub mono">{row.caseId}</span>
                </span>
                <span className="transition" aria-label={`A ${row.a}, B ${row.b}`}>
                  <StatusIcon status={row.a} label={`A: ${row.a}`} />
                  <Icon name="arrowRight" className="transition-arrow" />
                  <StatusIcon status={row.b} label={`B: ${row.b}`} />
                </span>
                <span className={`change-chip change-${row.change}`}>
                  <Icon name={CHANGE[row.change].icon} />
                  <span className="hide-xs">{CHANGE[row.change].label}</span>
                </span>
                <Icon name="chevronDown" className="row-chevron" />
              </button>
              {isOpen && ra && rb ? (
                <div id={detailId} className="row-detail side-by-side">
                  <div>
                    <div className="side-title">
                      <span className="version-tag">A</span> {result.a.promptName}
                    </div>
                    <CaseDetail result={ra} provider={result.a.provider} />
                  </div>
                  <div>
                    <div className="side-title">
                      <span className="version-tag version-b">B</span> {result.b.promptName}
                    </div>
                    <CaseDetail result={rb} provider={result.b.provider} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
