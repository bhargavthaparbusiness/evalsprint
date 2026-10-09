import { useState } from "react";
import type { RunResult, Suite } from "../../core/types.js";
import { api, ApiError } from "../api";
import type { RunTarget } from "../App";
import { CaseDetail } from "./CaseDetail";
import { Icon } from "./Icon";
import { formatMs, formatPercent, formatUsage, Notice, ResultBar, Spinner, StatusIcon } from "./ui";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: RunResult; snapshot: string }
  | { status: "error"; message: string; details: string[] };

export function RunView({ suite, blockedReason, target }: { suite: Suite; blockedReason?: string; target: RunTarget }) {
  const [promptId, setPromptId] = useState(suite.prompts[0]?.id ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selectedPrompt = suite.prompts.find((p) => p.id === promptId) ?? suite.prompts[0];
  const effectivePromptId = selectedPrompt?.id ?? "";

  async function run() {
    setState({ status: "running" });
    try {
      const result = await api.run(suite, effectivePromptId, target.provider, target.model);
      setState({ status: "done", result, snapshot: JSON.stringify(suite) });
      setExpanded(new Set(result.results.filter((r) => r.status !== "pass").map((r) => r.caseId)));
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(String(error));
      setState({ status: "error", message: e.message, details: e.details });
    }
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const running = state.status === "running";
  const disabledReason = blockedReason ?? target.blockedReason;
  const caseCount = suite.cases.length;

  return (
    <section className="view" aria-labelledby="run-heading">
      <div className="toolbar">
        <div className="toolbar-title">
          <h2 id="run-heading">Run evaluation</h2>
          <p>
            Render each case into the prompt, call the provider, check every assertion.
          </p>
        </div>
        <div className="toolbar-controls">
          <label className="inline-field">
            <span>Prompt</span>
            <select value={effectivePromptId} onChange={(e) => setPromptId(e.target.value)} disabled={running}>
              {suite.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary run-btn" onClick={run} disabled={running || Boolean(disabledReason)}>
            {running ? <Spinner /> : <Icon name="play" />}
            {running ? `Running ${caseCount} case${caseCount === 1 ? "" : "s"}…` : "Run evaluations"}
          </button>
        </div>
      </div>

      {disabledReason ? (
        <Notice tone="warn" title="Can't run yet">
          {disabledReason}
        </Notice>
      ) : null}
      {target.provider === "anthropic" && !disabledReason ? (
        <p className="cost-note">
          <Icon name="info" />
          Makes {caseCount} real API call{caseCount === 1 ? "" : "s"} to{" "}
          <code>{target.model || "the default model"}</code>, billed to the server's API key.
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

      {state.status === "idle" || state.status === "error" ? (
        <div className="panel">
          <div className="panel-head">
            <span>
              {caseCount} test case{caseCount === 1 ? "" : "s"} ready
            </span>
            <span className="muted mono">{selectedPrompt?.id}</span>
          </div>
          <ul className="pending-list">
            {suite.cases.map((c) => (
              <li key={c.id}>
                <span className="pending-dot" aria-hidden="true" />
                <span className="row-name">{c.name || c.id}</span>
                <span className="row-meta mono">
                  {c.assertions.length} check{c.assertions.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {running ? <SkeletonRows count={caseCount} /> : null}

      {state.status === "done" ? (
        <RunResults
          result={state.result}
          stale={state.snapshot !== JSON.stringify(suite)}
          expanded={expanded}
          onToggle={toggle}
        />
      ) : null}
    </section>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="panel" aria-busy="true" aria-label="Running evaluations">
      {Array.from({ length: Math.min(count, 8) }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className="skeleton skeleton-dot" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-short" />
        </div>
      ))}
    </div>
  );
}

export function RunResults({
  result,
  stale,
  expanded,
  onToggle,
}: {
  result: RunResult;
  stale: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const s = result.summary;
  const allPassed = s.passed === s.total;
  return (
    <div className="results">
      {stale ? <Notice tone="info">The suite changed since this run. Run again to see current results.</Notice> : null}

      <div className="summary">
        <div className="summary-score">
          <div className="summary-label">Pass rate</div>
          <div className={`summary-rate ${allPassed ? "is-pass" : "is-fail"}`}>{formatPercent(s.passRate)}</div>
          <ResultBar passed={s.passed} failed={s.failed} errored={s.errored} />
          <div className="summary-caption">
            <span className="mono">
              {s.passed}/{s.total}
            </span>{" "}
            cases passed · {result.promptName}
          </div>
        </div>
        <dl className="summary-stats">
          <div>
            <dt>
              <span className="legend legend-pass" /> Passed
            </dt>
            <dd>{s.passed}</dd>
          </div>
          <div>
            <dt>
              <span className="legend legend-fail" /> Failed
            </dt>
            <dd>{s.failed}</dd>
          </div>
          <div>
            <dt>
              <span className="legend legend-error" /> Errored
            </dt>
            <dd>{s.errored}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatMs(s.durationMs)}</dd>
          </div>
          <div className="summary-wide">
            <dt>Tokens</dt>
            <dd className={s.usage ? "" : "muted"}>{s.usage ? formatUsage(s.usage) : "Not reported"}</dd>
          </div>
        </dl>
      </div>

      <div className="run-meta">
        <span className="provider-chip">
          <Icon name={result.provider === "mock" ? "flask" : "plug"} />
          {result.provider === "mock" ? "Mock provider · fixture outputs" : `Anthropic · ${result.model ?? ""}`}
        </span>
        <span className="muted">{new Date(result.startedAt).toLocaleString()}</span>
      </div>

      <ul className="result-list">
        {result.results.map((r) => {
          const open = expanded.has(r.caseId);
          const detailId = `detail-${r.caseId}`;
          return (
            <li key={r.caseId} className={`result-row is-${r.status}${open ? " is-open" : ""}`}>
              <button className="row-button" aria-expanded={open} aria-controls={detailId} onClick={() => onToggle(r.caseId)}>
                <StatusIcon status={r.status} />
                <span className="row-main">
                  <span className="row-name">{r.caseName}</span>
                  <span className="row-sub mono">{r.caseId}</span>
                </span>
                <span className="row-checks">
                  {r.error ? (
                    <span className="row-error">Error</span>
                  ) : (
                    <>
                      <span className="check-dots" aria-hidden="true">
                        {r.assertions.map((a, i) => (
                          <span key={i} className={a.passed ? "dot-pass" : "dot-fail"} />
                        ))}
                      </span>
                      <span className="mono">
                        {r.assertions.filter((a) => a.passed).length}/{r.assertions.length}
                      </span>
                    </>
                  )}
                </span>
                <span className="row-meta mono hide-sm">{formatMs(r.latencyMs)}</span>
                <Icon name="chevronDown" className="row-chevron" />
              </button>
              {open ? (
                <div id={detailId} className="row-detail">
                  <CaseDetail result={r} provider={result.provider} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

