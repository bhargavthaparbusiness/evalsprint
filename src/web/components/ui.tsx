import type { ReactNode } from "react";
import type { CaseStatus, TokenUsage } from "../../core/types.js";
import type { IconName } from "../design/icons";
import { Icon } from "./Icon";

const STATUS: Record<CaseStatus, { label: string; icon: IconName }> = {
  pass: { label: "Pass", icon: "check" },
  fail: { label: "Fail", icon: "x" },
  error: { label: "Error", icon: "alert" },
};

/** Round status glyph. Always paired with text or an accessible label. */
export function StatusIcon({ status, label }: { status: CaseStatus; label?: string }) {
  return (
    <span className={`status-icon status-${status}`} role="img" aria-label={label ?? STATUS[status].label}>
      <Icon name={STATUS[status].icon} />
    </span>
  );
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <Icon name={STATUS[status].icon} />
      {STATUS[status].label}
    </span>
  );
}

/** Horizontal pass / fail / error proportion bar. */
export function ResultBar({ passed, failed, errored }: { passed: number; failed: number; errored: number }) {
  const total = passed + failed + errored;
  if (total === 0) return <div className="result-bar" aria-hidden="true" />;
  return (
    <div className="result-bar" aria-hidden="true">
      {passed > 0 ? <span className="seg seg-pass" style={{ flexGrow: passed }} /> : null}
      {failed > 0 ? <span className="seg seg-fail" style={{ flexGrow: failed }} /> : null}
      {errored > 0 ? <span className="seg seg-error" style={{ flexGrow: errored }} /> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "error" | "warn";
  title?: string;
  children?: ReactNode;
}) {
  const icon: IconName = tone === "info" ? "info" : "alert";
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={icon} className="notice-icon" />
      <div className="notice-content">
        {title ? <strong className="notice-title">{title}</strong> : null}
        {children ? <div className="notice-body">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} />
      </span>
      <div>
        <p className="empty-title">{title}</p>
        {children ? <p className="empty-text">{children}</p> : null}
        {action ? <div className="empty-action">{action}</div> : null}
      </div>
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
