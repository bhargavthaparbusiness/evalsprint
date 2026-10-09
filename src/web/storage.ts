import { sampleSuite } from "../core/sample.js";
import type { Suite } from "../core/types.js";

/**
 * Suites live in this browser's localStorage only. There is no server-side
 * storage, sync or sharing — use Export/Import (JSON) to move suites around.
 */
const KEY = "evalsprint:v1:workspace";

export interface Workspace {
  suites: Suite[];
  activeIndex: number;
}

export const cloneSample = (): Suite => structuredClone(sampleSuite);

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Workspace>;
      if (Array.isArray(parsed.suites) && parsed.suites.length > 0) {
        const activeIndex =
          typeof parsed.activeIndex === "number" && parsed.activeIndex < parsed.suites.length ? parsed.activeIndex : 0;
        return { suites: parsed.suites, activeIndex };
      }
    }
  } catch {
    // Unreadable or blocked storage: fall back to the sample workspace.
  }
  return { suites: [cloneSample()], activeIndex: 0 };
}

/** Returns false when the browser refused to store the workspace. */
export function saveWorkspace(workspace: Workspace): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}
