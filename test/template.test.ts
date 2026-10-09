import { describe, expect, it } from "vitest";
import { extractVariables, renderPrompt, renderTemplate, TemplateError } from "../src/core/template.js";

describe("renderTemplate", () => {
  it("substitutes variables, tolerating whitespace inside braces", () => {
    expect(renderTemplate("Hi {{name}}, you are {{ age }}.", { name: "Ada", age: "36" })).toBe("Hi Ada, you are 36.");
  });

  it("substitutes repeated variables", () => {
    expect(renderTemplate("{{x}}-{{x}}", { x: "a" })).toBe("a-a");
  });

  it("does not interpret $ patterns in values", () => {
    expect(renderTemplate("cost: {{v}}", { v: "$& $1" })).toBe("cost: $& $1");
  });

  it("allows empty-string values", () => {
    expect(renderTemplate("[{{v}}]", { v: "" })).toBe("[]");
  });

  it("throws a TemplateError listing all missing variables", () => {
    try {
      renderTemplate("{{a}} {{b}} {{c}}", { b: "x" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateError);
      expect((error as TemplateError).missing).toEqual(["a", "c"]);
      expect((error as Error).message).toBe("Missing template variables: a, c");
    }
  });

  it("does not resolve inherited object properties as variables", () => {
    expect(() => renderTemplate("{{toString}}", {})).toThrow(TemplateError);
  });

  it("leaves text that is not a valid placeholder alone", () => {
    expect(renderTemplate("{{ 1bad }} {single}", {})).toBe("{{ 1bad }} {single}");
  });
});

describe("extractVariables", () => {
  it("returns distinct names in order of first use", () => {
    expect(extractVariables("{{b}} {{a}} {{b}}")).toEqual(["b", "a"]);
  });
});

describe("renderPrompt", () => {
  it("renders system and user templates", () => {
    expect(
      renderPrompt({ id: "p", name: "P", system: "Role: {{role}}", template: "Q: {{q}}" }, { role: "judge", q: "why?" }),
    ).toEqual({ system: "Role: judge", user: "Q: why?" });
  });

  it("omits a blank system prompt", () => {
    expect(renderPrompt({ id: "p", name: "P", system: "  ", template: "hi" }, {})).toEqual({ user: "hi" });
  });
});
