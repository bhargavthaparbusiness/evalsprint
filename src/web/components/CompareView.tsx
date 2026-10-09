import { Fragment, useState } from "react";
import type { CaseResult, ComparisonResult, Suite } from "../../core/types.js";
import { api, ApiError } from "../api";
import type { RunTarget } from "../App";
import { CaseDetail } from "./CaseDetail";
import { formatPercent, Notice, Spinner, StatusBadge } from "./ui";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ComparisonResult; snapshot: string }
  | { status: "error"; message: string; details: string[] };

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
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(String(error));
      setState({ status: "error", message: e.message, details: e.details });
    }
  }

  const running = state.status === "running";

  return (
    <section aria-labelledby="compare-heading">
      <div className="toolbar">
        <h2 id="compare-heading" className="section-title">
          Compare prompt versions
        </h2>
        <div className="toolbar-controls">
          <label className="inline-field">
            <span>A</span>
            <select value={promptA} onChange={(e) => setA(e.target.value)} disabled={running}>
              {suite.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>B</span>
            <select value={promptB} onChange={(e) => setB(e.target.value)} disabled={running}>
              {suite.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={run} disabled={running || Boolean(disabledReason)}>
            {running ? (
              <>
                <Spinner /> Comparing…
              </>
            ) : (
              "Run comparison"
            )}
          </button>
        </div>
      </div>

      {disabledReason ? <Notice tone="warn" title="Can't compare yet">{disabledReason}</Notice> : null}
      {target.provider === "anthropic" && !disabledReason ? (
        <p className="muted small">
          This makes {suite.cases.length * 2} real API calls ({suite.cases.length} per version) to{" "}
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
        <div className="empty">
          <p>
            <strong>No comparison yet.</strong> Both prompt versions run against the same test cases with the same
            assertions, so you can see exactly which cases a change fixes or breaks.
          </p>
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
  const fixed = result.rows.filter((r) => r.change === "fixed").length;
  const regressed = result.rows.filter((r) => r.change === "regressed").length;
  const byId = (results: CaseResult[], id: string) => results.find((r) => r.caseId === id);

  return (
    <div className="results">
      {stale ? <Notice tone="info">The suite has been edited since this comparison. Run again to refresh.</Notice> : null}
      <div className="compare-summary">
        {[result.a, result.b].map((run, i) => (
          <div key={i} className="compare-card">
            <div className="compare-label">{i === 0 ? "A" : "B"}</div>
            <div className="compare-name">{run.promptName}</div>
            <div className="compare-rate">{formatPercent(run.summary.passRate)}</div>
            <div className="muted small">
              {run.summary.passed}/{run.summary.total} passed · {run.summary.failed} failed · {run.summary.errored} errored
            </div>
          </div>
        ))}
        <div className="compare-card compare-delta">
          <div className="compare-label">Change</div>
          <div className={`compare-rate ${delta > 0 ? "good" : delta < 0 ? "bad" : ""}`}>
            {delta > 0 ? "+" : ""}
            {delta} pts
          </div>
          <div className="muted small">
            {fixed} fixed · {regressed} regressed
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Test case</th>
              <th scope="col">A</th>
              <th scope="col">B</th>
              <th scope="col">Change</th>
              <th scope="col">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const ra = byId(result.a.results, row.caseId);
              const rb = byId(result.b.results, row.caseId);
              const isOpen = open === row.caseId;
              return (
                <Fragment key={row.caseId}>
                  <tr className={isOpen ? "row-open" : ""} onClick={() => onToggle(row.caseId)}>
                    <td data-label="Test case">
                      <div className="cell-title">{row.caseName}</div>
                      <div className="cell-sub mono">{row.caseId}</div>
                    </td>
                    <td data-label="A">
                      <StatusBadge status={row.a} />
                    </td>
                    <td data-label="B">
                      <StatusBadge status={row.b} />
                    </td>
                    <td data-label="Change">
                      <span className={`change change-${row.change}`}>{row.change}</span>
                    </td>
                    <td className="num">
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(row.caseId);
                        }}
                      >
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && ra && rb ? (
                    <tr className="detail-row">
                      <td colSpan={5}>
                        <div className="side-by-side">
                          <div>
                            <h4 className="side-title">A · {result.a.promptName}</h4>
                            <CaseDetail result={ra} provider={result.a.provider} />
                          </div>
                          <div>
                            <h4 className="side-title">B · {result.b.promptName}</h4>
                            <CaseDetail result={rb} provider={result.b.provider} />
                          </div>
                        </div>
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
