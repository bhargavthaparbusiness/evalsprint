# EvalSprint

Open-source regression testing for LLM prompts. Write test cases once, run any prompt version against them, and see exactly which cases pass, which fail, and why — before you ship a prompt change.

EvalSprint is for developers who iterate on prompts and want something more repeatable than eyeballing outputs in a playground, without adopting a hosted evaluation platform. It runs locally: a small Node server, a web UI, and a CLI that all share one evaluation engine.

> **Status:** early MVP (v0.1). The feature set below is what exists today. See [Limitations](#limitations) and [Roadmap](#roadmap).

## Features

- **Evaluation suites** — prompt versions (system prompt + `{{variable}}` template) and test cases in one JSON file.
- **Deterministic assertions** — `contains`, `not-contains`, `equals`, `regex`, `max-length`. A case passes only if every assertion passes, and each assertion explains its result (e.g. `does not contain "we will refund" — forbidden substring found at position 45`).
- **Clear errors** — missing template variables, provider failures, invalid regexes and malformed suites are reported per case or per field instead of crashing the run.
- **Mock provider** — deterministic fixture outputs stored in the suite. No API key, no cost, no model. Mock results are labelled as fixtures everywhere they appear.
- **Anthropic provider (optional)** — real calls through the official `@anthropic-ai/sdk`, using `ANTHROPIC_API_KEY` from the server environment only. Latency is measured; token usage is shown only when the API reports it.
- **Prompt comparison** — run two prompt versions against the same cases and see pass rates, the delta, and which cases were fixed or regressed.
- **Web UI** — edit prompts and test cases, run evaluations, inspect per-case output, rendered prompts and assertion results, compare versions. Works on mobile.
- **CLI** — `init`, `validate`, `run`, `compare`, with JSON output and CI-friendly exit codes.

## Quick start

Requires Node.js 20.12 or newer.

```bash
git clone https://github.com/bhargavthaparbusiness/evalsprint.git
cd evalsprint
npm install
npm run dev
```

Open <http://127.0.0.1:5050>. A sample suite ("Support ticket summarizer") is preloaded. Press **Run evaluations** — it runs on the mock provider with no configuration.

Production build:

```bash
npm run build
npm start          # serves the built UI and API on http://127.0.0.1:5050
```

## The mock demo (no credentials)

The sample suite has two prompt versions and four test cases. Its mock fixtures are hand-written so the demo shows every outcome:

| Prompt version   | Result | What you'll see |
| ---------------- | ------ | --------------- |
| `baseline` (v1)  | 1/4 pass | Missing ticket IDs, missing priority, and a forbidden refund promise |
| `structured` (v2) | 3/4 pass | Fixes three cases but **regresses** the feature-request case (labels it P2 instead of P3) |

From the CLI:

```bash
npm run evalsprint -- run examples/support-tickets.json
npm run evalsprint -- compare examples/support-tickets.json --a baseline --b structured
```

Real output of the comparison:

```
Compare: v1 — baseline  vs  v2 — structured

  Login outage is P1                    fail  → pass   fixed
  Billing issue without refund promise  fail  → pass   fixed
  Feature request is P3                 pass  → fail   regressed
  Vague ticket asks for details         fail  → pass   fixed

  A baseline: 1/4 (25%)
  B structured: 3/4 (75%)  +50 pts
```

**How the mock provider picks an output** for a case and prompt version:

1. `mockResponses[<prompt id>]`
2. `mockResponses.default`
3. Otherwise an echo of the rendered prompt, prefixed with `[mock echo — no fixture defined]`.

A fixture starting with `!error:` simulates a provider failure (e.g. `"!error: rate limited"`), so you can see how errors are reported. The mock provider never reports token usage, because no tokens are used.

## Example: evaluating a prompt

A suite file (the same format the UI exports and the CLI reads):

```json
{
  "version": 1,
  "name": "Support ticket summarizer",
  "prompts": [
    {
      "id": "structured",
      "name": "v2 — structured",
      "system": "You are a support triage assistant. Be concise and factual.",
      "template": "Summarize the ticket in one sentence. Start with the ticket ID in square brackets, then a priority of P1, P2 or P3. Never promise refunds.\n\nTicket {{ticket_id}}:\n{{ticket}}"
    }
  ],
  "cases": [
    {
      "id": "refund-request",
      "name": "Billing issue without refund promise",
      "vars": {
        "ticket_id": "T-1002",
        "ticket": "I was charged twice for my March invoice and I want my money back."
      },
      "assertions": [
        { "type": "contains", "value": "T-1002" },
        { "type": "not-contains", "value": "we will refund" },
        { "type": "regex", "pattern": "\\bP[23]\\b" }
      ],
      "mockResponses": {
        "structured": "[T-1002] P2 — Customer reports a duplicate charge on the March invoice; billing to investigate."
      }
    }
  ],
  "settings": { "model": "claude-opus-5-5", "maxTokens": 4096 }
}
```

Run it with the mock provider, then against a real model:

```bash
npm run evalsprint -- run suite.json --prompt structured
npm run evalsprint -- run suite.json --prompt structured --provider anthropic
```

### Suite reference

| Field | Notes |
| ----- | ----- |
| `prompts[].id` | Letters, numbers, `-`, `_`. Unique within the suite. |
| `prompts[].system` | Optional. May use `{{variables}}`. |
| `prompts[].template` | User message. `{{name}}` placeholders are filled from each case's `vars`. A missing variable makes that case an **error** rather than sending an incomplete prompt. |
| `cases[].vars` | String values for template variables. |
| `cases[].assertions` | At least one. See below. |
| `cases[].mockResponses` | Optional fixture outputs for the mock provider, keyed by prompt id or `default`. Ignored by real providers. |
| `settings.model` | Optional default model for real providers. |
| `settings.maxTokens` | Optional `max_tokens` for real providers (default 16000). |

| Assertion | Fields | Passes when |
| --------- | ------ | ----------- |
| `contains` | `value`, `caseSensitive?` (default false) | output contains `value` |
| `not-contains` | `value`, `caseSensitive?` (default false) | output does not contain `value` |
| `equals` | `value`, `trim?` (default true) | output equals `value` |
| `regex` | `pattern`, `flags?` | `new RegExp(pattern, flags)` matches the output |
| `max-length` | `value` | output has at most `value` characters |

Suites are validated (with [zod](https://zod.dev)) before anything runs; errors point at the exact field, e.g. `cases.0.assertions.0.pattern: invalid regular expression: …`.

## Anthropic provider (optional)

1. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` (or export it in your shell).
2. Restart `npm run dev` / `npm start`. The startup log says whether the provider is enabled.
3. In the UI, switch the provider toggle to **Anthropic** (optionally enter a model id), or pass `--provider anthropic` to the CLI.

Details:

- The key is read only from the server/CLI process environment. It is never sent to the browser; `/api/providers` reports only whether a key is set.
- Real calls happen only when Anthropic is explicitly selected. The UI shows how many API calls a run will make before you press Run.
- Default model: `claude-opus-5-5`. Override per run (UI model field / `--model`), per suite (`settings.model`), or globally with `EVALSPRINT_ANTHROPIC_MODEL`.
- Each case is one non-streaming Messages API request (up to 4 concurrently, SDK default retries). Latency, token usage (`input_tokens` / `output_tokens`), the served model and the stop reason are recorded as returned by the API.
- A `refusal` stop reason is reported as an error for that case. Server-side model fallbacks are intentionally **not** enabled, so results always come from the model you selected.
- Authentication, permission, 404 (unknown model), rate-limit, server and network errors are mapped to short, actionable messages.

**Verification status:** the provider is covered by unit tests with an SDK-shaped fake client, and the error path was checked against the live API with an invalid key (correctly reported as a 401). A successful run with a valid key has not been verified by the maintainers in this release — please open an issue if you hit problems.

## CLI

```
evalsprint init [file] [--force]          Write a sample suite (default: evalsprint.suite.json)
evalsprint validate <file>                Check a suite file for errors
evalsprint run <file> [options]           Run one prompt version against every test case
evalsprint compare <file> --a <id> --b <id> [options]

Options:
  --prompt <id>        Prompt version to run (default: first in the suite)
  --provider <name>    mock (default) or anthropic
  --model <id>         Model for real providers
  --json               Machine-readable output (RunResult / ComparisonResult)
```

Exit codes: `0` all tests passed, `1` at least one test failed or errored, `2` usage/configuration error. For `compare`, the exit code reflects version B.

Inside this repo use `npm run evalsprint -- <args>`. After `npm run build`, `node dist/cli/index.js <args>` works too, and `npm link` exposes an `evalsprint` command. (The package is not published to npm.)

## Deploy a preview to Vercel

The repo includes a small Vercel adapter (`vercel.json` and `api/*.js`). It serves the built UI as static files and exposes the existing API handler as serverless functions.

1. In Vercel, choose **Add New → Project**, import this GitHub repository, and keep the defaults (`vercel.json` sets the build command and output directory).
2. Deploy. The mock provider works immediately, with no environment variables.
3. **Do not set `ANTHROPIC_API_KEY` on a public deployment.** The app has no login, so anyone with the URL could spend your credits. With no key set, the Anthropic option shows as disabled.

Suites are still stored in each visitor's browser.

## Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ANTHROPIC_API_KEY` | — | Enables the Anthropic provider |
| `EVALSPRINT_ANTHROPIC_MODEL` | `claude-opus-5-5` | Default Anthropic model |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `5050` | Server port |

A `.env` file in the working directory is loaded automatically by the server and CLI; real environment variables take precedence.

## Storage

Suites you create or edit in the web UI are stored in **your browser's localStorage only**. There is no database, no server-side storage, no accounts and no sync between browsers or machines. Use **Export JSON** to save a suite to a file (for version control or the CLI) and **Import JSON** to load one. Run results are kept in memory and are lost on reload.

## Architecture

```
src/
  core/        Evaluation engine — no UI or HTTP dependencies
    schema.ts      zod schemas (single source of truth for suite files)
    template.ts    {{variable}} rendering with missing-variable errors
    assertions.ts  deterministic assertions with explanations
    runner.ts      runSuite / compareSuite / compareRuns
    providers/     mock + Anthropic behind one Provider interface
    sample.ts      built-in demo suite
  server/      node:http API (/api/providers, /api/run, /api/compare) + static/Vite serving
  cli/         CLI on top of core
  web/         React UI (Vite); talks only to the server API
test/          Vitest tests
examples/      Sample suite file
```

The web UI never evaluates anything itself: it posts the suite to the local server, which runs `core`. The CLI calls `core` directly.

**Security notes.** The server binds to `127.0.0.1` by default and has no authentication. If you set `HOST=0.0.0.0`, anyone who can reach the port can run evaluations — and spend your API credits if a key is configured; the server prints a warning. POST endpoints require `Content-Type: application/json` and reject cross-origin requests, so other websites can't trigger runs through your local server.

## Development

```bash
npm run dev         # server + Vite middleware with HMR on :5050
npm test            # Vitest (engine, assertions, templates, providers, API, CLI)
npm run lint        # ESLint
npm run typecheck   # tsc for node and web code
npm run check       # lint + typecheck + test
npm run build       # dist/ (server, CLI, core) + dist/web (UI)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every push to `main` and every pull request.

## Limitations

- Assertions are deterministic string checks only. There is no LLM-as-judge, semantic similarity or JSON-schema assertion yet.
- One provider call per case; no multi-turn conversations, tools, images or streaming.
- Only the mock and Anthropic providers exist.
- No persistent run history; browser-local suite storage only (see [Storage](#storage)).
- No authentication — intended for local, single-user use.
- No cost estimation; token counts are shown when the provider reports them.

## Roadmap

Ideas, not commitments:

- JSON / JSON-schema and numeric assertions; optional model-graded assertions.
- Saved run history and diffing outputs between runs.
- Repeat runs per case to measure flakiness at non-zero sampling variance.
- More providers behind the same interface.
- A GitHub Action wrapper around `evalsprint run`.

## Contributing

Issues and pull requests are welcome.

1. Fork and create a branch.
2. `npm install`, then make your change with tests (engine logic belongs in `src/core` with tests in `test/`).
3. Run `npm run check` and `npm run build` — both must pass.
4. Open a PR describing the change and how you verified it.

Please don't commit `.env` files or API keys.

## License

[MIT](LICENSE) © 2026 bhargavthaparbusiness
