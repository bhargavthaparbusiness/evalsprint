import type { PromptVersion, Suite } from "../../core/types.js";
import { extractVariables } from "../../core/template.js";
import { uniqueId } from "../ids";
import { Icon } from "./Icon";
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
    <section className="view" aria-labelledby="prompts-heading">
      <div className="toolbar">
        <div className="toolbar-title">
          <h2 id="prompts-heading">
            Prompt versions <span className="count">{suite.prompts.length}</span>
          </h2>
          <p>
            Use <code>{"{{variable}}"}</code> placeholders. A case missing a variable is reported as an error instead of
            sending an incomplete prompt.
          </p>
        </div>
        <div className="toolbar-controls">
          <button className="btn" onClick={() => add()}>
            <Icon name="plus" />
            Add version
          </button>
        </div>
      </div>
      <div className="stack">
        {suite.prompts.map((prompt, index) => {
          const vars = [...new Set([...extractVariables(prompt.system ?? ""), ...extractVariables(prompt.template)])];
          return (
            <article key={index} className="card">
              <div className="card-head">
                <h3 className="card-title">
                  <Icon name="prompt" />
                  {prompt.name || "Untitled prompt"}
                  <span className="id-chip mono">{prompt.id}</span>
                </h3>
                <div className="card-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => add(prompt)}>
                    <Icon name="copy" />
                    <span className="hide-xs">Duplicate</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost btn-danger"
                    aria-label="Delete prompt version"
                    onClick={() => remove(index)}
                    disabled={suite.prompts.length <= 1}
                    title={suite.prompts.length <= 1 ? "A suite needs at least one prompt version" : "Delete prompt version"}
                  >
                    <Icon name="trash" />
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
                      <span className="chips">
                        {vars.map((v) => (
                          <code key={v} className="chip">
                            {v}
                          </code>
                        ))}
                      </span>
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
