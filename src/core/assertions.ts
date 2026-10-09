import type { Assertion, AssertionResult } from "./types.js";

const PREVIEW_LENGTH = 80;

/** Truncates long text for messages; callers JSON.stringify it so whitespace stays visible. */
function preview(text: string): string {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

/** Short human-readable description of an assertion, e.g. `contains "refund"`. */
export function describeAssertion(assertion: Assertion): string {
  switch (assertion.type) {
    case "contains":
      return `contains ${JSON.stringify(assertion.value)}${assertion.caseSensitive ? " (case-sensitive)" : ""}`;
    case "not-contains":
      return `does not contain ${JSON.stringify(assertion.value)}${assertion.caseSensitive ? " (case-sensitive)" : ""}`;
    case "equals":
      return `equals ${JSON.stringify(preview(assertion.value))}`;
    case "regex":
      return `matches /${assertion.pattern}/${assertion.flags ?? ""}`;
    case "max-length":
      return `at most ${assertion.value} characters`;
  }
}

/** Evaluates one deterministic assertion against a model output. Never throws. */
export function evaluateAssertion(assertion: Assertion, output: string): AssertionResult {
  const label = describeAssertion(assertion);
  const result = (passed: boolean, detail: string): AssertionResult => ({
    assertion,
    passed,
    message: `${passed ? "Passed" : "Failed"}: ${label} — ${detail}`,
  });

  switch (assertion.type) {
    case "contains":
    case "not-contains": {
      const caseSensitive = assertion.caseSensitive ?? false;
      const haystack = caseSensitive ? output : output.toLowerCase();
      const needle = caseSensitive ? assertion.value : assertion.value.toLowerCase();
      const index = haystack.indexOf(needle);
      const found = index !== -1;
      if (assertion.type === "contains") {
        return result(found, found ? `found at position ${index}` : "substring not found in output");
      }
      return result(!found, found ? `forbidden substring found at position ${index}` : "substring absent");
    }
    case "equals": {
      const trim = assertion.trim ?? true;
      const actual = trim ? output.trim() : output;
      const expected = trim ? assertion.value.trim() : assertion.value;
      return result(
        actual === expected,
        actual === expected ? "output matches exactly" : `output was ${JSON.stringify(preview(actual))}`,
      );
    }
    case "regex": {
      let pattern: RegExp;
      try {
        pattern = new RegExp(assertion.pattern, assertion.flags);
      } catch (error) {
        return result(false, `invalid regular expression: ${(error as Error).message}`);
      }
      const match = pattern.exec(output);
      return result(match !== null, match ? `matched ${JSON.stringify(preview(match[0]))}` : "no match in output");
    }
    case "max-length": {
      const length = [...output].length;
      return result(length <= assertion.value, `output is ${length} characters`);
    }
  }
}
