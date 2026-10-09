import type { PromptVersion, Suite } from "../../core/types.js";
import { extractVariables } from "../../core/template.js";
import { uniqueId } from "../ids";
import { Field } from "./ui";

export function PromptsEditor({ suite, onChange }: { suite: Suite; onChange: (suite: Suite) => void }) {
  function update(index: number, patch: Partial<PromptVersion>) {
    const old = suite.prompts[index];
    if (!old) return;
    const prompts = suite.prompts.map((p, i) => (i === index ? { ...p, ...patch } : p));
    let cases = suite.cases;
    // Keep per-prompt mock fixtures attached when a prompt id is renamed.
    if (patch.id !== undefined && patch.id !== old.id) {
      const newId = patch.id;
      cases = cases.map((c) => {
        if (!c.mockResponses || !(old.id in c.mockResponses)) return c;
        const { [old.id]: moved, ...rest } = c.mockResponses;
        return { ...c, mockResponses: { ...rest, [newId]: moved ?? "" } };
      });
    }
    onChange({ ...suite, prompts, cases });
  }

  function add(from?: PromptVersion) {
    const id = uniqueId(from ? `${from.id}-copy` : "prompt", suite.prompts.map((p) => p.id));
    const prompt: PromptVersion = from
      ? { ...from, id, name: `${from.name} (copy)` }
      : { id, name: `Prompt ${suite.prompts.length + 1}`, template: "" };
    onChange({ ...suite, prompts: [...suite.prompts, prompt] });
  }

  function remove(index: number) {
    const prompt = suite.prompts[index];
    if (!prompt || suite.prompts.length <= 1) return;
    if (!window.confirm(`Delete prompt version "${prompt.name}"? Its mock fixtures will be removed too.`)) return;
    const cases = suite.cases.map((c) => {
      if (!c.mockResponses || !(prompt.id in c.mockResponses)) return c;
      const { [prompt.id]: _removed, ...rest } = c.mockResponses;
      return { ...c, mockResponses: rest };
    });
    onChange({ ...suite, prompts: suite.prompts.filter((_, i) => i !== index), cases });
  }

  return (
    <section aria-labelledby="prompts-heading">
      <div className="toolbar">
        <h2 id="prompts-heading" className="section-title">
          Prompt versions
        </h2>
        <button className="btn" onClick={() => add()}>
          Add prompt version
        </button>
      </div>
      <p className="muted small">
        Use <code>{"{{variable}}"}</code> placeholders; each test case supplies the values. A case that is missing a
        variable is reported as an error instead of sending an incomplete prompt.
      </p>
      <div className="stack">
        {suite.prompts.map((prompt, index) => {
          const vars = [...new Set([...extractVariables(prompt.system ?? ""), ...extractVariables(prompt.template)])];
          return (
            <article key={index} className="card">
              <div className="card-head">
                <h3 className="card-title">{prompt.name || "Untitled prompt"}</h3>
                <div className="card-actions">
                  <button className="btn btn-sm" onClick={() => add(prompt)}>
                    Duplicate
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => remove(index)}
                    disabled={suite.prompts.length <= 1}
                    title={suite.prompts.length <= 1 ? "A suite needs at least one prompt version" : undefined}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="grid-2">
                <Field label="Name">
                  <input value={prompt.name} onChange={(e) => update(index, { name: e.target.value })} />
                </Field>
                <Field label="ID" hint="Letters, numbers, - and _. Used by the CLI and mock fixtures.">
                  <input className="mono" value={prompt.id} onChange={(e) => update(index, { id: e.target.value })} />
                </Field>
              </div>
              <Field label="System prompt (optional)">
                <textarea
                  rows={2}
                  value={prompt.system ?? ""}
                  onChange={(e) => update(index, { system: e.target.value || undefined })}
                />
              </Field>
              <Field
                label="User prompt template"
                hint={
                  vars.length > 0 ? (
                    <>
                      Variables:{" "}
                      {vars.map((v) => (
                        <code key={v} className="chip">
                          {v}
                        </code>
                      ))}
                    </>
                  ) : (
                    "No variables yet."
                  )
                }
              >
                <textarea
                  rows={6}
                  className="mono"
                  value={prompt.template}
                  onChange={(e) => update(index, { template: e.target.value })}
                />
              </Field>
            </article>
          );
        })}
      </div>
    </section>
  );
}
