import type { ReactNode } from "react";
import type { CaseStatus, TokenUsage } from "../../core/types.js";

export function StatusBadge({ status }: { status: CaseStatus }) {
  const label = status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Error";
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className={`metric${tone ? ` metric-${tone}` : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "error" | "warn"; title?: string; children?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {title ? <strong>{title}</strong> : null}
      {children ? <div className="notice-body">{children}</div> : null}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export const formatPercent = (n: number) => `${Math.round(n * 100)}%`;

export function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatUsage(usage: TokenUsage | undefined): string {
  if (!usage) return "—";
  return `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
