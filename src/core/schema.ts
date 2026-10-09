import { z } from "zod";

/**
 * Zod schemas are the single source of truth for suite configuration.
 * They are shared by the engine, the HTTP API, the CLI and the web UI
 * (for import validation), so a suite file means the same thing everywhere.
 */

const idSchema = z
  .string()
  .min(1, "must not be empty")
  .max(64, "must be at most 64 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "may only contain letters, numbers, '-' and '_'");

const nonEmpty = z.string().min(1, "must not be empty");

export const assertionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("contains"),
    value: nonEmpty,
    caseSensitive: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("not-contains"),
    value: nonEmpty,
    caseSensitive: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("equals"),
    value: z.string(),
    /** Trim surrounding whitespace on both sides before comparing. Defaults to true. */
    trim: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: nonEmpty.max(500, "must be at most 500 characters"),
    flags: z
      .string()
      .regex(/^[dgimsuvy]*$/, "contains an unsupported regex flag")
      .optional(),
  }),
  z.object({
    type: z.literal("max-length"),
    value: z.number().int().positive(),
  }),
]);

export const promptVersionSchema = z.object({
  id: idSchema,
  name: nonEmpty,
  system: z.string().optional(),
  template: nonEmpty,
});

export const testCaseSchema = z.object({
  id: idSchema,
  name: nonEmpty,
  vars: z.record(z.string(), z.string()).default({}),
  assertions: z.array(assertionSchema).min(1, "each test case needs at least one assertion"),
  /**
   * Deterministic fixture outputs for the mock provider, keyed by prompt
   * version id. The special key "default" applies to any prompt version
   * without its own entry. Ignored by real providers.
   */
  mockResponses: z.record(z.string(), z.string()).optional(),
});

export const suiteSchema = z
  .object({
    version: z.literal(1).default(1),
    name: nonEmpty,
    description: z.string().optional(),
    prompts: z.array(promptVersionSchema).min(1, "a suite needs at least one prompt version"),
    cases: z.array(testCaseSchema).min(1, "a suite needs at least one test case").max(500),
    settings: z
      .object({
        model: z.string().min(1).optional(),
        maxTokens: z.number().int().positive().max(128000).optional(),
      })
      .optional(),
  })
  .superRefine((suite, ctx) => {
    checkUnique(
      suite.prompts.map((p) => p.id),
      "prompts",
      ctx,
    );
    checkUnique(
      suite.cases.map((c) => c.id),
      "cases",
      ctx,
    );
    suite.cases.forEach((testCase, caseIndex) => {
      testCase.assertions.forEach((assertion, assertionIndex) => {
        if (assertion.type !== "regex") return;
        try {
          new RegExp(assertion.pattern, assertion.flags);
        } catch (error) {
          ctx.addIssue({
            code: "custom",
            path: ["cases", caseIndex, "assertions", assertionIndex, "pattern"],
            message: `invalid regular expression: ${(error as Error).message}`,
          });
        }
      });
    });
  });

function checkUnique(ids: string[], key: string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: [key, index, "id"],
        message: `duplicate id "${id}"`,
      });
    }
    seen.add(id);
  });
}

export const providerIdSchema = z.enum(["mock", "anthropic"]);

/** Formats zod issues as readable "path: message" lines. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseSuite(input: unknown): ParseResult<z.infer<typeof suiteSchema>> {
  const result = suiteSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: formatIssues(result.error) };
}
