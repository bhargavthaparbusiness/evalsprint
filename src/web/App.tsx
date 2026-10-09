import { useEffect, useMemo, useRef, useState } from "react";
import { parseSuite } from "../core/schema.js";
import type { ProviderId, ProviderInfo, Suite } from "../core/types.js";
import { api, ApiError } from "./api";
import { CasesEditor } from "./components/CasesEditor";
import { CompareView } from "./components/CompareView";
import { JsonEditor } from "./components/JsonEditor";
import { PromptsEditor } from "./components/PromptsEditor";
import { RunView } from "./components/RunView";
import { Notice } from "./components/ui";
import { cloneSample, loadWorkspace, saveWorkspace, type Workspace } from "./storage";

export interface RunTarget {
  provider: ProviderId;
  model?: string;
  /** Set when the selected provider can't be used right now. */
  blockedReason?: string;
}

type Tab = "run" | "compare" | "prompts" | "cases" | "json";
const TABS: { id: Tab; label: string }[] = [
  { id: "run", label: "Run" },
  { id: "compare", label: "Compare" },
  { id: "prompts", label: "Prompts" },
  { id: "cases", label: "Test cases" },
  { id: "json", label: "JSON" },
];

const INTRO_KEY = "evalsprint:v1:intro-dismissed";

function blankSuite(existing: Suite[]): Suite {
  const names = new Set(existing.map((s) => s.name));
  let name = "Untitled suite";
  for (let n = 2; names.has(name); n++) name = `Untitled suite ${n}`;
  return {
    version: 1,
    name,
    prompts: [{ id: "v1", name: "v1", template: "Answer briefly: {{question}}" }],
    cases: [
      {
        id: "arithmetic",
        name: "Simple arithmetic",
        vars: { question: "What is 2 + 2?" },
        assertions: [{ type: "contains", value: "4" }],
        mockResponses: { default: "2 + 2 = 4" },
      },
    ],
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "suite";
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function App() {
  const [workspace, setWorkspaceState] = useState<Workspace>(loadWorkspace);
  const [tab, setTab] = useState<Tab>("run");
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderId>("mock");
  const [model, setModel] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const [importError, setImportError] = useState<string[] | null>(null);
  const [showIntro, setShowIntro] = useState(() => !readFlag(INTRO_KEY));
  const fileInput = useRef<HTMLInputElement>(null);

  /** Every workspace change goes through here so it is persisted immediately. */
  function setWorkspace(update: (ws: Workspace) => Workspace) {
    const next = update(workspace);
    setWorkspaceState(next);
    setStorageOk(saveWorkspace(next));
  }

  const suite = workspace.suites[workspace.activeIndex] ?? workspace.suites[0] ?? cloneSample();
  const validation = useMemo(() => parseSuite(suite), [suite]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .providers()
        .then((list) => {
          if (cancelled) return;
          setProviders(list);
          setProvidersError(null);
        })
        .catch((error: unknown) => {
          if (!cancelled) setProvidersError(error instanceof ApiError ? error.message : String(error));
        });
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const anthropic = providers?.find((p) => p.id === "anthropic");
  const target: RunTarget = {
    provider,
    ...(provider === "anthropic" && model.trim() ? { model: model.trim() } : {}),
    ...(providersError
      ? { blockedReason: providersError }
      : provider === "anthropic" && !anthropic?.available
        ? { blockedReason: anthropic?.note ?? "Checking provider availability…" }
        : {}),
  };
  const defaultModel = suite.settings?.model ?? anthropic?.defaultModel ?? "";

  const blockedReason = validation.ok
    ? undefined
    : `This suite has ${validation.errors.length} validation issue${validation.errors.length === 1 ? "" : "s"}. Fix them in the editor tabs (listed above).`;

  function updateSuite(next: Suite) {
    setWorkspace((ws) => ({ ...ws, suites: ws.suites.map((s, i) => (i === ws.activeIndex ? next : s)) }));
  }

  function addSuite(newSuite: Suite) {
    setWorkspace((ws) => ({ suites: [...ws.suites, newSuite], activeIndex: ws.suites.length }));
    setTab("run");
  }

  function deleteSuite() {
    if (workspace.suites.length <= 1) return;
    if (!window.confirm(`Delete suite "${suite.name}" from this browser? This cannot be undone.`)) return;
    setWorkspace((ws) => ({
      suites: ws.suites.filter((_, i) => i !== ws.activeIndex),
      activeIndex: Math.max(0, ws.activeIndex - 1),
    }));
  }

  function exportSuite() {
    const blob = new Blob([`${JSON.stringify(suite, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(suite.name)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSuite(file: File) {
    setImportError(null);
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch (error) {
      setImportError([`${file.name} is not valid JSON: ${(error as Error).message}`]);
      return;
    }
    const result = parseSuite(json);
    if (!result.ok) {
      setImportError(result.errors.map((e) => `${file.name}: ${e}`));
      return;
    }
    addSuite(result.value);
  }

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Non-essential preference.
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ✓
          </span>
          <div>
            <div className="brand-name">EvalSprint</div>
            <div className="brand-tag">Test and compare LLM prompts against repeatable cases</div>
          </div>
        </div>
        <div className="provider-picker">
          <div className="segmented" role="radiogroup" aria-label="Provider">
            {(["mock", "anthropic"] as const).map((id) => {
              const info = providers?.find((p) => p.id === id);
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={provider === id}
                  className={provider === id ? "active" : ""}
                  onClick={() => setProvider(id)}
                  title={info?.note}
                >
                  {id === "mock" ? "Mock" : "Anthropic"}
                  {id === "anthropic" && providers && !info?.available ? <span className="dot dot-off" /> : null}
                  {id === "anthropic" && info?.available ? <span className="dot dot-on" /> : null}
                </button>
              );
            })}
          </div>
          {provider === "anthropic" ? (
            <input
              className="model-input mono"
              aria-label="Anthropic model"
              placeholder={defaultModel || "model id"}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          ) : null}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Suites">
          <div className="sidebar-head">
            <span className="sidebar-title">Suites</span>
          </div>
          <ul className="suite-list">
            {workspace.suites.map((s, i) => (
              <li key={i}>
                <button
                  className={i === workspace.activeIndex ? "suite-item active" : "suite-item"}
                  onClick={() => setWorkspace((ws) => ({ ...ws, activeIndex: i }))}
                  aria-current={i === workspace.activeIndex}
                >
                  <span className="suite-name">{s.name || "Untitled suite"}</span>
                  <span className="suite-meta">
                    {s.prompts.length} prompt{s.prompts.length === 1 ? "" : "s"} · {s.cases.length} case
                    {s.cases.length === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-actions">
            <button className="btn btn-sm" onClick={() => addSuite(blankSuite(workspace.suites))}>
              New suite
            </button>
            <button className="btn btn-sm" onClick={() => fileInput.current?.click()}>
              Import JSON
            </button>
            <button className="btn btn-sm" onClick={exportSuite}>
              Export JSON
            </button>
            <button className="btn btn-sm" onClick={() => addSuite(cloneSample())}>
              Add sample suite
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={deleteSuite}
              disabled={workspace.suites.length <= 1}
              title={workspace.suites.length <= 1 ? "Keep at least one suite" : undefined}
            >
              Delete suite
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importSuite(file);
              }}
            />
          </div>
          <p className="sidebar-note">
            Suites are saved in this browser's local storage only — not on the server and not synced. Export JSON to
            keep a copy or to run it with the CLI.
          </p>
        </aside>

        <main className="main">
          {showIntro ? (
            <div className="intro">
              <div>
                <h1 className="intro-title">Catch prompt regressions before you ship</h1>
                <ol className="intro-steps">
                  <li>
                    <strong>Define test cases</strong> — input variables plus assertions (contains, does not contain,
                    equals, regex, max length).
                  </li>
                  <li>
                    <strong>Run a prompt version</strong> — every case is rendered, sent to the provider, and checked.
                  </li>
                  <li>
                    <strong>Compare versions</strong> — see which cases a prompt change fixes or breaks.
                  </li>
                </ol>
                <p className="muted small">
                  The <strong>Mock</strong> provider returns fixture outputs stored in the suite, so the sample suite
                  runs instantly with no API key and no model involved. Switch to <strong>Anthropic</strong> for real
                  model calls once <code>ANTHROPIC_API_KEY</code> is set on the server.
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={dismissIntro} aria-label="Dismiss introduction">
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="suite-header">
            <input
              className="suite-title-input"
              aria-label="Suite name"
              value={suite.name}
              onChange={(e) => updateSuite({ ...suite, name: e.target.value })}
            />
            <input
              className="suite-desc-input"
              aria-label="Suite description"
              placeholder="Add a description…"
              value={suite.description ?? ""}
              onChange={(e) => updateSuite({ ...suite, description: e.target.value || undefined })}
            />
          </div>

          {providersError ? (
            <Notice tone="error" title="Server unavailable">
              {providersError}
            </Notice>
          ) : null}
          {!storageOk ? (
            <Notice tone="warn" title="Changes are not being saved">
              This browser blocked local storage. Export your suite as JSON to keep it.
            </Notice>
          ) : null}
          {importError ? (
            <Notice tone="error" title="Import failed">
              <ul>
                {importError.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {!validation.ok ? (
            <Notice tone="warn" title="Suite has validation issues">
              <ul>
                {validation.errors.map((e) => (
                  <li key={e} className="mono small">
                    {e}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <nav className="tabs" role="tablist" aria-label="Suite views">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Run and Compare stay mounted so results survive tab switches; they reset when the suite changes. */}
          <div hidden={tab !== "run"} role="tabpanel">
            <RunView key={`run-${workspace.activeIndex}`} suite={suite} blockedReason={blockedReason} target={target} />
          </div>
          <div hidden={tab !== "compare"} role="tabpanel">
            <CompareView
              key={`cmp-${workspace.activeIndex}`}
              suite={suite}
              blockedReason={blockedReason}
              target={target}
            />
          </div>
          {tab === "prompts" ? (
            <div role="tabpanel">
              <PromptsEditor suite={suite} onChange={updateSuite} />
            </div>
          ) : null}
          {tab === "cases" ? (
            <div role="tabpanel">
              <CasesEditor suite={suite} onChange={updateSuite} />
            </div>
          ) : null}
          {tab === "json" ? (
            <div role="tabpanel">
              <JsonEditor key={workspace.activeIndex} suite={suite} onChange={updateSuite} />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
