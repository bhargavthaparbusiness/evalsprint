import vm from "node:vm";

export type RegexMatcher = (pattern: string, flags: string | undefined, text: string) => string | null;

export class RegexTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegexTimeoutError";
  }
}

const script = new vm.Script("(() => { const m = new RegExp(p, f).exec(s); return m === null ? null : m[0]; })()");

/**
 * Returns a matcher that runs user-supplied regular expressions with a hard
 * time limit, so a pathological pattern cannot block the process.
 * Node-only (uses node:vm).
 */
export function createGuardedRegexMatcher(timeoutMs: number, totalBudgetMs = Number.POSITIVE_INFINITY): RegexMatcher {
  const context = vm.createContext({ p: "", f: undefined as string | undefined, s: "" });
  let spentMs = 0;
  return (pattern, flags, text) => {
    // vm timeouts are whole milliseconds, so a sub-millisecond remainder counts as exhausted.
    const remaining = Math.floor(totalBudgetMs - spentMs);
    if (remaining < 1) {
      throw new RegexTimeoutError(`regex time budget of ${totalBudgetMs} ms for this run is exhausted`);
    }
    const limit = Math.max(1, Math.floor(Math.min(timeoutMs, remaining)));
    context.p = pattern;
    context.f = flags;
    context.s = text;
    const started = performance.now();
    try {
      return script.runInContext(context, { timeout: limit }) as string | null;
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
        throw new RegexTimeoutError(`regex evaluation exceeded ${limit} ms (possible catastrophic backtracking)`);
      }
      throw error;
    } finally {
      spentMs += performance.now() - started;
      context.s = "";
    }
  };
}
