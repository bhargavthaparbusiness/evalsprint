import { describe, expect, it } from "vitest";
import { parseSuite } from "../src/core/schema.js";
import { sampleSuite } from "../src/core/sample.js";

const minimal = {
  name: "s",
  prompts: [{ id: "p1", name: "P1", template: "Hi {{x}}" }],
  cases: [{ id: "c1", name: "C1", vars: { x: "y" }, assertions: [{ type: "contains", value: "y" }] }],
};

describe("parseSuite", () => {
  it("accepts the built-in sample suite", () => {
    expect(parseSuite(sampleSuite).ok).toBe(true);
  });

  it("fills defaults", () => {
    const result = parseSuite({ ...minimal, cases: [{ id: "c", name: "C", assertions: [{ type: "equals", value: "" }] }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(1);
      expect(result.value.cases[0]?.vars).toEqual({});
    }
  });

  it("rejects duplicate ids with a path", () => {
    const result = parseSuite({ ...minimal, prompts: [minimal.prompts[0], minimal.prompts[0]] });
    expect(result).toEqual({ ok: false, errors: ['prompts.1.id: duplicate id "p1"'] });
  });

  it("rejects invalid regexes at load time", () => {
    const result = parseSuite({
      ...minimal,
      cases: [{ id: "c", name: "C", assertions: [{ type: "regex", pattern: "(" }] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^cases\.0\.assertions\.0\.pattern: invalid regular expression/);
  });

  it("rejects unknown assertion types and cases without assertions", () => {
    expect(parseSuite({ ...minimal, cases: [{ id: "c", name: "C", assertions: [{ type: "llm-judge" }] }] }).ok).toBe(false);
    const empty = parseSuite({ ...minimal, cases: [{ id: "c", name: "C", assertions: [] }] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors[0]).toContain("at least one assertion");
  });

  it("rejects ids with unsafe characters and non-objects", () => {
    expect(parseSuite({ ...minimal, prompts: [{ id: "a b", name: "x", template: "t" }] }).ok).toBe(false);
    expect(parseSuite(null).ok).toBe(false);
    expect(parseSuite("suite").ok).toBe(false);
  });
});
