import { useEffect, useMemo, useRef, useState } from "react";
import { parseSuite } from "../core/schema.js";
import type { ProviderId, ProviderInfo, Suite } from "../core/types.js";
import { api, ApiError } from "./api";
import { CasesEditor } from "./components/CasesEditor";
import { CompareView } from "./components/CompareView";
import { JsonEditor } from "./components/JsonEditor";
import { PromptsEditor } from "./components/PromptsEditor";
import { RunView } from "./components/RunView";
import { Icon } from "./components/Icon";
import { Notice } from "./components/ui";
import type { IconName } from "./design/icons";
import { cloneSample, loadWorkspace, saveWorkspace, type Workspace } from "./storage";

export interface RunTarget {
  provider: ProviderId;
  model?: string;
  /** Set when the selected provider can't be used right now. */
  blockedReason?: string;
}

type Tab = "run" | "compare" | "prompts" | "cases" | "json";
const TABS: { id: Tab; label: string; short?: string; icon: IconName }[] = [
  { id: "run", label: "Run", icon: "play" },
  { id: "compare", label: "Compare", icon: "compare" },
  { id: "prompts", label: "Prompts", icon: "prompt" },
  { id: "cases", label: "Test cases", short: "Cases", icon: "cases" },
  { id: "json", label: "JSON", icon: "braces" },
];

// Pre-rename storage key, kept for compatibility (see storage.ts).
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

  const suiteActions = (
    <>
      <button className="btn btn-sm btn-ghost" onClick={() => addSuite(blankSuite(workspace.suites))}>
        <Icon name="plus" />
        New suite
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => fileInput.current?.click()}>
        <Icon name="upload" />
        Import JSON
      </button>
      <button className="btn btn-sm btn-ghost" onClick={exportSuite}>
        <Icon name="download" />
        Export JSON
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => addSuite(cloneSample())}>
        <Icon name="flask" />
        Add sample suite
      </button>
      <button
        className="btn btn-sm btn-ghost btn-danger"
        onClick={deleteSuite}
        disabled={workspace.suites.length <= 1}
        title={workspace.suites.length <= 1 ? "Keep at least one suite" : undefined}
      >
        <Icon name="trash" />
        Delete suite
      </button>
    </>
  );

  return (
    <div className="app">
      <header className="app-bar">
        <a className="brand" href="/" aria-label="PitchvioEvals home">
          <img className="logo" src="/favicon.svg" alt="" width="24" height="24" />
          <span className="brand-name">PitchvioEvals</span>
        </a>
        <span className="app-bar-divider hide-sm" aria-hidden="true" />
        <span className="app-bar-crumb hide-sm">
          <Icon name="folder" />
          <span className="truncate">{suite.name || "Untitled suite"}</span>
        </span>
        <div className="app-bar-spacer" />
        <div className="provider-switch" role="radiogroup" aria-label="Provider">
          {(["mock", "anthropic"] as const).map((id) => {
            const info = providers?.find((p) => p.id === id);
            const unavailable = id === "anthropic" && providers !== null && !info?.available;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={provider === id}
                className={provider === id ? "is-active" : ""}
                onClick={() => setProvider(id)}
                title={info?.note}
              >
                <Icon name={id === "mock" ? "flask" : "plug"} />
                {id === "mock" ? "Mock" : "Anthropic"}
                {id === "anthropic" && providers ? (
                  <span className={`status-dot ${unavailable ? "is-off" : "is-on"}`} aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        <a
          className="btn btn-ghost btn-icon hide-xs"
          href="https://github.com/bhargavthaparbusiness/evalsprint"
          aria-label="PitchvioEvals on GitHub"
          title="GitHub"
        >
          <Icon name="github" />
        </a>
      </header>

      <div className="app-body">
        <aside className="sidebar" aria-label="Suites">
          <div className="sidebar-title">
            <span>Suites</span>
            <span className="count">{workspace.suites.length}</span>
          </div>
          <ul className="suite-list">
            {workspace.suites.map((s, i) => (
              <li key={i}>
                <button
                  className={i === workspace.activeIndex ? "suite-item is-active" : "suite-item"}
                  onClick={() => setWorkspace((ws) => ({ ...ws, activeIndex: i }))}
                  aria-current={i === workspace.activeIndex}
                >
                  <Icon name="folder" />
                  <span className="suite-text">
                    <span className="suite-name">{s.name || "Untitled suite"}</span>
                    <span className="suite-meta">
                      {s.prompts.length} prompt{s.prompts.length === 1 ? "" : "s"} · {s.cases.length} case
                      {s.cases.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-actions">{suiteActions}</div>
          <p className="sidebar-note">
            <Icon name="lock" />
            <span>Saved in this browser only — not on the server, not synced. Export JSON to keep a copy or use the CLI.</span>
          </p>
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
        </aside>

        <main className="main" id="main">
          <div className="mobile-suite-bar">
            <label className="mobile-suite-select">
              <span className="sr-only">Suite</span>
              <Icon name="folder" />
              <select
                value={workspace.activeIndex}
                onChange={(e) => setWorkspace((ws) => ({ ...ws, activeIndex: Number(e.target.value) }))}
              >
                {workspace.suites.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name || "Untitled suite"}
                  </option>
                ))}
              </select>
            </label>
            <details className="menu">
              <summary className="btn btn-icon" aria-label="Suite actions">
                <Icon name="menu" />
              </summary>
              <div
                className="menu-panel"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {suiteActions}
                <p className="menu-note">
                  <Icon name="lock" /> Saved in this browser only.
                </p>
              </div>
            </details>
          </div>

          {showIntro ? (
            <div className="intro">
              <div className="intro-body">
                <p className="intro-title">Catch prompt regressions before they ship.</p>
                <ol className="intro-steps">
                  <li>
                    <span className="step-num mono">1</span>
                    <span>
                      <strong>Define cases</strong> with variables and assertions.
                    </span>
                  </li>
                  <li>
                    <span className="step-num mono">2</span>
                    <span>
                      <strong>Run a prompt version</strong> and see why each case passed or failed.
                    </span>
                  </li>
                  <li>
                    <span className="step-num mono">3</span>
                    <span>
                      <strong>Compare versions</strong> to find what a change fixed or broke.
                    </span>
                  </li>
                </ol>
                <p className="intro-note">
                  <Icon name="flask" />
                  <span>
                    The <strong>Mock</strong> provider returns fixture outputs stored in the suite — no API key and no
                    model involved.
                  </span>
                </p>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm intro-close" onClick={dismissIntro} aria-label="Dismiss introduction">
                <Icon name="x" />
              </button>
            </div>
          ) : null}

          <h1 className="sr-only">PitchvioEvals — {suite.name || "Untitled suite"}</h1>
          <div className="suite-header">
            <input
              className="suite-title-input"
              aria-label="Suite name"
              value={suite.name}
              onChange={(e) => updateSuite({ ...suite, name: e.target.value })}
            />
            <textarea
              className="suite-desc-input"
              aria-label="Suite description"
              placeholder="Add a description…"
              rows={1}
              value={suite.description ?? ""}
              onChange={(e) => updateSuite({ ...suite, description: e.target.value || undefined })}
            />
          </div>

          {provider === "anthropic" ? (
            <div className="provider-panel">
              <Icon name="plug" />
              <div className="provider-panel-text">
                <strong>Anthropic</strong>
                <span>{anthropic?.note ?? "Checking provider availability…"}</span>
              </div>
              <label className="inline-field model-field">
                <span>Model</span>
                <input
                  className="mono"
                  aria-label="Anthropic model"
                  placeholder={defaultModel || "model id"}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
            </div>
          ) : null}

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
                  <li key={e} className="mono">
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
                aria-label={t.label}
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab is-active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} />
                {t.short ? (
                  <>
                    <span className="hide-xs">{t.label}</span>
                    <span className="show-xs" aria-hidden="true">
                      {t.short}
                    </span>
                  </>
                ) : (
                  t.label
                )}
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

      <footer className="app-footer">
        <span>PitchvioEvals · MIT · The public demo runs the mock provider only</span>
        <nav aria-label="Footer">
          <a href="/">Home</a>
          <a href="https://github.com/bhargavthaparbusiness/evalsprint#readme">Docs</a>
          <a href="https://github.com/bhargavthaparbusiness/evalsprint">GitHub</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </div>
  );
}
