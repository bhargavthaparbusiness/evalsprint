import { Fragment, useState } from "react";
import type { RunResult, Suite } from "../../core/types.js";
import { api, ApiError } from "../api";
import type { RunTarget } from "../App";
import { CaseDetail } from "./CaseDetail";
import { formatMs, formatPercent, formatUsage, Metric, Notice, Spinner, StatusBadge } from "./ui";

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

  return (
    <section aria-labelledby="run-heading">
      <div className="toolbar">
        <h2 id="run-heading" className="section-title">
          Run evaluation
        </h2>
        <div className="toolbar-controls">
          <label className="inline-field">
            <span>Prompt version</span>
            <select value={effectivePromptId} onChange={(e) => setPromptId(e.target.value)} disabled={running}>
              {suite.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={run} disabled={running || Boolean(disabledReason)}>
            {running ? (
              <>
                <Spinner /> Running {suite.cases.length} case{suite.cases.length === 1 ? "" : "s"}…
              </>
            ) : (
              "Run evaluations"
            )}
          </button>
        </div>
      </div>

      {disabledReason ? <Notice tone="warn" title="Can't run yet">{disabledReason}</Notice> : null}
      {target.provider === "anthropic" && !disabledReason ? (
        <p className="muted small">
          This makes {suite.cases.length} real API call{suite.cases.length === 1 ? "" : "s"} to{" "}
          <code>{target.model || "the default model"}</code>, billed to the key configured on the server.
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
        <div className="empty">
          <p>
            <strong>No results yet.</strong> Pick a prompt version and press <em>Run evaluations</em>. Each test case's
            variables are rendered into the prompt, sent to the selected provider, and the response is checked against
            the case's assertions.
          </p>
        </div>
      ) : null}

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
  return (
    <div className="results">
      {stale ? (
        <Notice tone="info">The suite has been edited since this run. Run again to see current results.</Notice>
      ) : null}
      <div className="run-meta">
        <span>
          <strong>{result.promptName}</strong> · {result.provider === "mock" ? "Mock provider (fixture outputs)" : `Anthropic · ${result.model ?? ""}`}
        </span>
        <span className="muted">{new Date(result.startedAt).toLocaleString()}</span>
      </div>
      <div className="metrics">
        <Metric label="Pass rate" value={formatPercent(s.passRate)} tone={s.passed === s.total ? "good" : "bad"} />
        <Metric label="Passed" value={`${s.passed} / ${s.total}`} />
        <Metric label="Failed" value={s.failed} tone={s.failed > 0 ? "bad" : undefined} />
        <Metric label="Errored" value={s.errored} tone={s.errored > 0 ? "warn" : undefined} />
        <Metric label="Duration" value={formatMs(s.durationMs)} />
        <Metric
          label="Tokens"
          value={s.usage ? formatUsage(s.usage) : "—"}
          hint={s.usage ? "as reported by the provider" : "not reported by this provider"}
        />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Test case</th>
              <th scope="col">Checks</th>
              <th scope="col" className="num">
                Latency
              </th>
              <th scope="col" className="num">
                Tokens
              </th>
              <th scope="col">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((r) => {
              const open = expanded.has(r.caseId);
              const passedChecks = r.assertions.filter((a) => a.passed).length;
              return (
                <Fragment key={r.caseId}>
                  <tr className={`row-${r.status}${open ? " row-open" : ""}`} onClick={() => onToggle(r.caseId)}>
                    <td data-label="Status">
                      <StatusBadge status={r.status} />
                    </td>
                    <td data-label="Test case">
                      <div className="cell-title">{r.caseName}</div>
                      <div className="cell-sub mono">{r.caseId}</div>
                    </td>
                    <td data-label="Checks">
                      {r.error ? (
                        <span className="error-text">{r.error}</span>
                      ) : (
                        `${passedChecks}/${r.assertions.length} passed`
                      )}
                    </td>
                    <td data-label="Latency" className="num">
                      {formatMs(r.latencyMs)}
                    </td>
                    <td data-label="Tokens" className="num">
                      {formatUsage(r.usage)}
                    </td>
                    <td className="num">
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(r.caseId);
                        }}
                      >
                        {open ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <CaseDetail result={r} provider={result.provider} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
