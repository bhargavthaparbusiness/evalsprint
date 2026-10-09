import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createProvider, ProviderError } from "../core/providers/index.js";
import { compareSuite, EvalConfigError, runSuite } from "../core/runner.js";
import { sampleSuite } from "../core/sample.js";
import { parseSuite, providerIdSchema } from "../core/schema.js";
import type { ProviderId, Suite } from "../core/types.js";
import { formatComparison, formatRun, makeColors } from "./format.js";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  color: boolean;
}

export const HELP = `EvalSprint — evaluate LLM prompts against repeatable test cases.

Usage:
  evalsprint init [file] [--force]          Write a sample suite (default: evalsprint.suite.json)
  evalsprint validate <file>                Check a suite file for errors
  evalsprint run <file> [options]           Run one prompt version against every test case
  evalsprint compare <file> --a <id> --b <id> [options]
                                            Run two prompt versions and compare per case

Options:
  --prompt <id>        Prompt version to run (default: first in the suite)
  --provider <name>    mock (default) or anthropic (needs ANTHROPIC_API_KEY)
  --model <id>         Model for real providers (default: suite setting or provider default)
  --json               Print machine-readable JSON instead of a report
  --force              Overwrite an existing file (init only)
  -h, --help           Show this help

Exit codes: 0 all tests passed · 1 a test failed or errored · 2 usage or configuration error`;

class UsageError extends Error {}

const DEFAULT_SUITE_FILE = "evalsprint.suite.json";

async function loadSuite(file: string, cwd: string): Promise<Suite> {
  const fullPath = path.resolve(cwd, file);
  let raw: string;
  try {
    raw = await readFile(fullPath, "utf8");
  } catch {
    throw new UsageError(`Cannot read suite file: ${fullPath}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`Suite file is not valid JSON: ${(error as Error).message}`);
  }
  const result = parseSuite(json);
  if (!result.ok) throw new UsageError(`Invalid suite ${file}:\n  ${result.errors.join("\n  ")}`);
  return result.value;
}

function parseProvider(value: string | undefined): ProviderId {
  const parsed = providerIdSchema.safeParse(value ?? "mock");
  if (!parsed.success) throw new UsageError(`Unknown provider "${value}". Use "mock" or "anthropic".`);
  return parsed.data;
}

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        prompt: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        a: { type: "string" },
        b: { type: "string" },
        json: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, file] = positionals;
  const c = makeColors(io.color && !values.json);

  if (values.help || !command) {
    io.stdout(HELP);
    return command || values.help ? 0 : 2;
  }

  try {
    switch (command) {
      case "init": {
        const target = path.resolve(io.cwd, file ?? DEFAULT_SUITE_FILE);
        if (existsSync(target) && !values.force) {
          throw new UsageError(`${target} already exists. Use --force to overwrite.`);
        }
        await writeFile(target, `${JSON.stringify(sampleSuite, null, 2)}\n`, "utf8");
        const rel = path.relative(io.cwd, target) || target;
        io.stdout(`Created ${rel}\n\nTry it (no API key needed):\n  evalsprint run ${rel}\n  evalsprint compare ${rel} --a baseline --b structured`);
        return 0;
      }
      case "validate": {
        if (!file) throw new UsageError("Usage: evalsprint validate <file>");
        const suite = await loadSuite(file, io.cwd);
        io.stdout(
          `${c.green("Valid")}: "${suite.name}" — ${suite.prompts.length} prompt version(s), ${suite.cases.length} test case(s)`,
        );
        return 0;
      }
      case "run": {
        if (!file) throw new UsageError("Usage: evalsprint run <file> [--prompt <id>] [--provider mock|anthropic]");
        const suite = await loadSuite(file, io.cwd);
        const provider = createProvider(parseProvider(values.provider));
        const run = await runSuite(suite, {
          provider,
          ...(values.prompt ? { promptId: values.prompt } : {}),
          ...(values.model ? { model: values.model } : {}),
        });
        io.stdout(values.json ? JSON.stringify(run, null, 2) : formatRun(run, c));
        return run.summary.passed === run.summary.total ? 0 : 1;
      }
      case "compare": {
        if (!file || !values.a || !values.b) {
          throw new UsageError("Usage: evalsprint compare <file> --a <prompt-id> --b <prompt-id>");
        }
        const suite = await loadSuite(file, io.cwd);
        const provider = createProvider(parseProvider(values.provider));
        const cmp = await compareSuite(suite, values.a, values.b, {
          provider,
          ...(values.model ? { model: values.model } : {}),
        });
        io.stdout(values.json ? JSON.stringify(cmp, null, 2) : formatComparison(cmp, c));
        const allPass = cmp.b.summary.passed === cmp.b.summary.total;
        return allPass ? 0 : 1;
      }
      default:
        throw new UsageError(`Unknown command "${command}".\n\n${HELP}`);
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof EvalConfigError || error instanceof ProviderError) {
      io.stderr(`${c.red("Error:")} ${error.message}`);
      return 2;
    }
    throw error;
  }
}
