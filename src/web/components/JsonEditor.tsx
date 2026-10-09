import { useState } from "react";
import { parseSuite } from "../../core/schema.js";
import type { Suite } from "../../core/types.js";
import { Icon } from "./Icon";
import { Notice } from "./ui";

/** Raw JSON view of the suite — the same format the CLI reads. */
export function JsonEditor({ suite, onChange }: { suite: Suite; onChange: (suite: Suite) => void }) {
  const current = JSON.stringify(suite, null, 2);
  const [text, setText] = useState(current);
  const [errors, setErrors] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const dirty = text !== current;

  function apply() {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      setErrors([`Invalid JSON: ${(error as Error).message}`]);
      return;
    }
    const result = parseSuite(json);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setApplied(true);
    onChange(result.value);
    setText(JSON.stringify(result.value, null, 2));
  }

  return (
    <section className="view" aria-labelledby="json-heading">
      <div className="toolbar">
        <div className="toolbar-title">
          <h2 id="json-heading">Suite JSON</h2>
          <p>
            The exact file format the CLI reads (<code>pitchvioevals run suite.json</code>). Changes are validated before
            they apply.
          </p>
        </div>
        <div className="toolbar-controls">
          <button
            className="btn"
            onClick={() => {
              setText(current);
              setErrors([]);
            }}
            disabled={!dirty}
          >
            Revert
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={!dirty}>
            <Icon name="check" />
            Apply changes
          </button>
        </div>
      </div>
      {errors.length > 0 ? (
        <Notice tone="error" title="Not applied">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {applied && !dirty && errors.length === 0 ? <Notice tone="info">Changes applied.</Notice> : null}
      <textarea
        className="mono json-editor code-area"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setApplied(false);
        }}
        aria-label="Suite JSON"
      />
    </section>
  );
}
