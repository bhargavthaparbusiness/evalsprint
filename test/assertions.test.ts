import { describe, expect, it } from "vitest";
import { describeAssertion, evaluateAssertion } from "../src/core/assertions.js";

describe("evaluateAssertion", () => {
  it("contains is case-insensitive by default", () => {
    const r = evaluateAssertion({ type: "contains", value: "REFUND" }, "We issued a refund.");
    expect(r.passed).toBe(true);
    expect(r.message).toContain("found at position");
  });

  it("contains can be case-sensitive", () => {
    const r = evaluateAssertion({ type: "contains", value: "REFUND", caseSensitive: true }, "a refund");
    expect(r.passed).toBe(false);
    expect(r.message).toContain("substring not found");
  });

  it("not-contains fails when the forbidden text appears and says where", () => {
    const r = evaluateAssertion({ type: "not-contains", value: "we will refund" }, "OK, We Will Refund you.");
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/forbidden substring found at position 4/);
  });

  it("not-contains passes when absent", () => {
    expect(evaluateAssertion({ type: "not-contains", value: "sorry" }, "Done.").passed).toBe(true);
  });

  it("equals trims by default", () => {
    expect(evaluateAssertion({ type: "equals", value: "yes" }, "  yes\n").passed).toBe(true);
  });

  it("equals can compare without trimming and reports the actual output", () => {
    const r = evaluateAssertion({ type: "equals", value: "yes", trim: false }, " yes");
    expect(r.passed).toBe(false);
    expect(r.message).toContain('output was " yes"');
  });

  it("regex matches with flags", () => {
    const r = evaluateAssertion({ type: "regex", pattern: "^p\\d$", flags: "im" }, "intro\nP1");
    expect(r.passed).toBe(true);
    expect(r.message).toContain('matched "P1"');
  });

  it("regex reports no match", () => {
    expect(evaluateAssertion({ type: "regex", pattern: "\\bP1\\b" }, "P12").passed).toBe(false);
  });

  it("an invalid regex fails instead of throwing", () => {
    const r = evaluateAssertion({ type: "regex", pattern: "(" }, "anything");
    expect(r.passed).toBe(false);
    expect(r.message).toContain("invalid regular expression");
  });

  it("max-length counts characters, not UTF-16 units", () => {
    expect(evaluateAssertion({ type: "max-length", value: 2 }, "😀😀").passed).toBe(true);
    const r = evaluateAssertion({ type: "max-length", value: 3 }, "abcd");
    expect(r.passed).toBe(false);
    expect(r.message).toContain("output is 4 characters");
  });

  it("describes assertions readably", () => {
    expect(describeAssertion({ type: "regex", pattern: "a+", flags: "i" })).toBe("matches /a+/i");
    expect(describeAssertion({ type: "not-contains", value: "x" })).toBe('does not contain "x"');
  });
});
