import type { Assertion, AssertionType, Suite, TestCase } from "../../core/types.js";
import { extractVariables } from "../../core/template.js";
import { uniqueId } from "../ids";
import { Icon } from "./Icon";
import { Field } from "./ui";

const ASSERTION_TYPES: { type: AssertionType; label: string }[] = [
  { type: "contains", label: "Contains" },
  { type: "not-contains", label: "Does not contain" },
  { type: "equals", label: "Equals exactly" },
  { type: "regex", label: "Matches regex" },
  { type: "max-length", label: "Max length" },
];

function defaultAssertion(type: AssertionType): Assertion {
  switch (type) {
    case "contains":
    case "not-contains":
      return { type, value: "" };
    case "equals":
      return { type, value: "" };
    case "regex":
      return { type, pattern: "" };
    case "max-length":
      return { type, value: 280 };
  }
}

function AssertionRow({
  assertion,
  onChange,
  onRemove,
  canRemove,
}: {
  assertion: Assertion;
  onChange: (a: Assertion) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="assertion-row">
      <select
        className="assertion-type"
        aria-label="Assertion type"
        value={assertion.type}
        onChange={(e) => onChange(defaultAssertion(e.target.value as AssertionType))}
      >
        {ASSERTION_TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
      <div className="assertion-fields">
      {assertion.type === "contains" || assertion.type === "not-contains" ? (
        <>
          <input
            aria-label="Text"
            placeholder="text"
            value={assertion.value}
            onChange={(e) => onChange({ ...assertion, value: e.target.value })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={assertion.caseSensitive ?? false}
              onChange={(e) => onChange({ ...assertion, caseSensitive: e.target.checked || undefined })}
            />
            Case-sensitive
          </label>
        </>
      ) : null}
      {assertion.type === "equals" ? (
        <>
          <input
            aria-label="Expected output"
            placeholder="expected output"
            value={assertion.value}
            onChange={(e) => onChange({ ...assertion, value: e.target.value })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={assertion.trim ?? true}
              onChange={(e) => onChange({ ...assertion, trim: e.target.checked ? undefined : false })}
            />
            Trim whitespace
          </label>
        </>
      ) : null}
      {assertion.type === "regex" ? (
        <>
          <input
            aria-label="Pattern"
            className="mono"
            placeholder="pattern, e.g. \bP[1-3]\b"
            value={assertion.pattern}
            onChange={(e) => onChange({ ...assertion, pattern: e.target.value })}
          />
          <input
            aria-label="Flags"
            className="mono flags"
            placeholder="flags"
            value={assertion.flags ?? ""}
            onChange={(e) => onChange({ ...assertion, flags: e.target.value || undefined })}
          />
        </>
      ) : null}
      {assertion.type === "max-length" ? (
        <input
          aria-label="Maximum characters"
          type="number"
          min={1}
          value={Number.isFinite(assertion.value) ? assertion.value : ""}
          onChange={(e) => onChange({ ...assertion, value: e.target.valueAsNumber })}
        />
      ) : null}
      </div>
      <button
        className="btn btn-ghost btn-icon assertion-remove"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="Remove assertion"
        title={canRemove ? "Remove assertion" : "Each test case needs at least one assertion"}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

export function CasesEditor({ suite, onChange }: { suite: Suite; onChange: (suite: Suite) => void }) {
  const promptVars = [
    ...new Set(suite.prompts.flatMap((p) => [...extractVariables(p.system ?? ""), ...extractVariables(p.template)])),
  ];

  function update(index: number, patch: Partial<TestCase>) {
    onChange({ ...suite, cases: suite.cases.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  }

  function add(from?: TestCase) {
    const id = uniqueId(from ? `${from.id}-copy` : "case", suite.cases.map((c) => c.id));
    const testCase: TestCase = from
      ? { ...structuredClone(from), id, name: `${from.name} (copy)` }
      : {
          id,
          name: `Test case ${suite.cases.length + 1}`,
          vars: Object.fromEntries(promptVars.map((v) => [v, ""])),
          assertions: [{ type: "contains", value: "" }],
        };
    onChange({ ...suite, cases: [...suite.cases, testCase] });
  }

  function remove(index: number) {
    const testCase = suite.cases[index];
    if (!testCase || suite.cases.length <= 1) return;
    if (!window.confirm(`Delete test case "${testCase.name}"?`)) return;
    onChange({ ...suite, cases: suite.cases.filter((_, i) => i !== index) });
  }

  return (
    <section className="view" aria-labelledby="cases-heading">
      <div className="toolbar">
        <div className="toolbar-title">
          <h2 id="cases-heading">
            Test cases <span className="count">{suite.cases.length}</span>
          </h2>
          <p>A case passes only when every assertion passes. Mock fixtures are the canned outputs the mock provider returns.</p>
        </div>
        <div className="toolbar-controls">
          <button className="btn" onClick={() => add()}>
            <Icon name="plus" />
            Add case
          </button>
        </div>
      </div>
      <div className="stack">
        {suite.cases.map((testCase, index) => {
          const extraVars = Object.keys(testCase.vars).filter((v) => !promptVars.includes(v));
          const setVar = (name: string, value: string) => update(index, { vars: { ...testCase.vars, [name]: value } });
          const setMock = (key: string, value: string) => {
            const next = { ...(testCase.mockResponses ?? {}) };
            if (value === "") delete next[key];
            else next[key] = value;
            update(index, { mockResponses: Object.keys(next).length > 0 ? next : undefined });
          };
          return (
            <details key={index} className="card case-card" open={index === 0 || suite.cases.length <= 3 || undefined}>
              <summary className="card-head">
                <Icon name="chevronRight" className="disclosure-chevron" />
                <span className="card-title">
                  <span className="truncate">{testCase.name || "Untitled case"}</span>
                  <span className="id-chip mono hide-xs">{testCase.id}</span>
                </span>
                <span className="card-count mono">
                  {testCase.assertions.length} check{testCase.assertions.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="card-body">
                <div className="grid-2">
                  <Field label="Name">
                    <input value={testCase.name} onChange={(e) => update(index, { name: e.target.value })} />
                  </Field>
                  <Field label="ID">
                    <input className="mono" value={testCase.id} onChange={(e) => update(index, { id: e.target.value })} />
                  </Field>
                </div>

                <h4 className="subhead">
                  <Icon name="braces" /> Variables
                </h4>
                {promptVars.length === 0 && extraVars.length === 0 ? (
                  <p className="muted small">The prompt templates don't use any variables.</p>
                ) : null}
                {promptVars.map((v) => (
                  <Field
                    key={v}
                    label={v}
                    hint={!(v in testCase.vars) ? <span className="warn-text">Missing — this case will error.</span> : undefined}
                  >
                    <textarea rows={2} value={testCase.vars[v] ?? ""} onChange={(e) => setVar(v, e.target.value)} />
                  </Field>
                ))}
                {extraVars.length > 0 ? (
                  <p className="muted small chips">
                    Unused:{" "}
                    {extraVars.map((v) => (
                      <button
                        key={v}
                        className="chip chip-button"
                        title="Remove this unused variable"
                        onClick={() => {
                          const { [v]: _removed, ...rest } = testCase.vars;
                          update(index, { vars: rest });
                        }}
                      >
                        {v}
                        <Icon name="x" />
                      </button>
                    ))}
                  </p>
                ) : null}

                <h4 className="subhead">
                  <Icon name="check" /> Assertions
                </h4>
                <div className="stack-sm">
                  {testCase.assertions.map((assertion, ai) => (
                    <AssertionRow
                      key={ai}
                      assertion={assertion}
                      canRemove={testCase.assertions.length > 1}
                      onChange={(a) =>
                        update(index, { assertions: testCase.assertions.map((x, j) => (j === ai ? a : x)) })
                      }
                      onRemove={() => update(index, { assertions: testCase.assertions.filter((_, j) => j !== ai) })}
                    />
                  ))}
                </div>
                <button
                  className="btn btn-sm btn-ghost add-assertion"
                  onClick={() => update(index, { assertions: [...testCase.assertions, defaultAssertion("contains")] })}
                >
                  <Icon name="plus" />
                  Add assertion
                </button>

                <h4 className="subhead">
                  <Icon name="flask" /> Mock fixtures
                </h4>
                <p className="field-hint">
                  Leave empty to fall back to the default fixture, then to an echo of the rendered prompt. Start a
                  fixture with <code>!error:</code> to simulate a provider failure.
                </p>
                {[...suite.prompts.map((p) => ({ key: p.id, label: `${p.name} (${p.id})` })), { key: "default", label: "Default (any prompt version)" }].map(
                  ({ key, label }) => (
                    <Field key={key} label={label}>
                      <textarea
                        rows={2}
                        value={testCase.mockResponses?.[key] ?? ""}
                        onChange={(e) => setMock(key, e.target.value)}
                      />
                    </Field>
                  ),
                )}

                <div className="card-actions card-foot">
                  <button className="btn btn-sm btn-ghost" onClick={() => add(testCase)}>
                    <Icon name="copy" />
                    Duplicate
                  </button>
                  <button
                    className="btn btn-sm btn-ghost btn-danger"
                    onClick={() => remove(index)}
                    disabled={suite.cases.length <= 1}
                    title={suite.cases.length <= 1 ? "A suite needs at least one test case" : undefined}
                  >
                    <Icon name="trash" />
                    Delete case
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
