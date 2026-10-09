import type { PromptVersion, RenderedPrompt } from "./types.js";

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly missing: string[],
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

/** Lists the distinct `{{variable}}` names referenced by a template, in order of first use. */
export function extractVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

/**
 * Replaces `{{name}}` placeholders with values from `vars`.
 * Throws a TemplateError listing every missing variable rather than
 * silently sending an incomplete prompt to a model.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const missing = extractVariables(template).filter((name) => !Object.hasOwn(vars, name));
  if (missing.length > 0) {
    throw new TemplateError(
      `Missing template variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      missing,
    );
  }
  return template.replace(VARIABLE_PATTERN, (_, name: string) => vars[name] ?? "");
}

export function renderPrompt(prompt: PromptVersion, vars: Record<string, string>): RenderedPrompt {
  const user = renderTemplate(prompt.template, vars);
  const system = prompt.system?.trim() ? renderTemplate(prompt.system, vars) : undefined;
  return system === undefined ? { user } : { system, user };
}
