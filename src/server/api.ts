import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { createProvider, describeProviders, ProviderError, type Provider } from "../core/providers/index.js";
import { compareSuite, EvalConfigError, runSuite } from "../core/runner.js";
import { formatIssues, providerIdSchema, suiteSchema } from "../core/schema.js";
import type { ProviderId } from "../core/types.js";

const DEFAULT_MAX_BODY_BYTES = 1_000_000;

const modelSchema = z.string().trim().min(1).max(200).optional();

const runRequestSchema = z.object({
  suite: suiteSchema,
  promptId: z.string().min(1),
  provider: providerIdSchema,
  model: modelSchema,
});

const compareRequestSchema = z.object({
  suite: suiteSchema,
  promptA: z.string().min(1),
  promptB: z.string().min(1),
  provider: providerIdSchema,
  model: modelSchema,
});

export interface ApiOptions {
  env?: NodeJS.ProcessEnv;
  /** Maximum request body size in bytes. Defaults to 1 MB. */
  maxBodyBytes?: number;
  /** Maximum test cases per suite accepted by run/compare. Defaults to the schema limit. */
  maxCases?: number;
  /**
   * When set, the Anthropic provider is disabled regardless of any API key and
   * this text is shown as the reason (used by public deployments).
   */
  anthropicDisabledReason?: string;
  /** Time limit per regex assertion in milliseconds. */
  regexTimeoutMs?: number;
  /** Total regex time per run in milliseconds. */
  regexBudgetMs?: number;
  /** Override provider construction (used by tests). */
  providerFactory?: (id: ProviderId) => Provider;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes) {
      throw new HttpError(413, `Request body is larger than ${Math.round(maxBytes / 1000)} KB`);
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

/**
 * Rejects cross-site requests: a page on another origin must not be able to
 * trigger (paid) model calls through a locally running PitchvioEvals server.
 */
function assertSameOrigin(req: IncomingMessage): void {
  const origin = req.headers.origin;
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Invalid Origin header");
  }
  if (originHost !== req.headers.host) throw new HttpError(403, "Cross-origin requests are not allowed");
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "Invalid request", formatIssues(result.error));
  return result.data;
}

/** Abort in-flight provider calls if the browser goes away mid-run. */
function abortOnDisconnect(res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

/**
 * Handles `/api/*` routes. Returns false for any other path so the caller can
 * serve the web UI.
 */
export function createApiHandler(options: ApiOptions = {}) {
  const env = options.env ?? process.env;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const baseFactory = options.providerFactory ?? createProvider;
  const disabledReason = options.anthropicDisabledReason;
  const makeProvider = (id: ProviderId): Provider => {
    if (id === "anthropic" && disabledReason) throw new ProviderError(disabledReason);
    return baseFactory(id);
  };
  const checkCaseLimit = (suite: { cases: unknown[] }) => {
    if (options.maxCases !== undefined && suite.cases.length > options.maxCases) {
      throw new HttpError(400, `This server accepts at most ${options.maxCases} test cases per suite`);
    }
  };
  const providerList = () =>
    describeProviders(env).map((p) =>
      p.id === "anthropic" && disabledReason ? { ...p, available: false, note: disabledReason } : p,
    );

  return async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;

    try {
      const route = `${req.method ?? "GET"} ${url.pathname}`;
      switch (route) {
        case "GET /api/health":
          sendJson(res, 200, { ok: true });
          return true;
        case "GET /api/providers":
          sendJson(res, 200, { providers: providerList() });
          return true;
        case "POST /api/run": {
          assertSameOrigin(req);
          const body = parseBody(runRequestSchema, await readJson(req, maxBodyBytes));
          checkCaseLimit(body.suite);
          const provider = makeProvider(body.provider);
          const result = await runSuite(body.suite, {
            provider,
            promptId: body.promptId,
            ...(body.model ? { model: body.model } : {}),
            ...(options.regexTimeoutMs ? { regexTimeoutMs: options.regexTimeoutMs } : {}),
            ...(options.regexBudgetMs ? { regexBudgetMs: options.regexBudgetMs } : {}),
            signal: abortOnDisconnect(res),
          });
          sendJson(res, 200, result);
          return true;
        }
        case "POST /api/compare": {
          assertSameOrigin(req);
          const body = parseBody(compareRequestSchema, await readJson(req, maxBodyBytes));
          checkCaseLimit(body.suite);
          const provider = makeProvider(body.provider);
          const result = await compareSuite(body.suite, body.promptA, body.promptB, {
            provider,
            ...(body.model ? { model: body.model } : {}),
            ...(options.regexTimeoutMs ? { regexTimeoutMs: options.regexTimeoutMs } : {}),
            ...(options.regexBudgetMs ? { regexBudgetMs: options.regexBudgetMs } : {}),
            signal: abortOnDisconnect(res),
          });
          sendJson(res, 200, result);
          return true;
        }
        default: {
          const known = ["/api/health", "/api/providers", "/api/run", "/api/compare"];
          if (known.includes(url.pathname)) throw new HttpError(405, `Method ${req.method} not allowed`);
          throw new HttpError(404, `Unknown API route ${url.pathname}`);
        }
      }
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return true;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message, ...(error.details ? { details: error.details } : {}) });
      } else if (error instanceof EvalConfigError || error instanceof ProviderError) {
        sendJson(res, 400, { error: error.message });
      } else {
        console.error("[pitchvioevals] unexpected API error:", error);
        sendJson(res, 500, { error: "Internal server error. See the server log for details." });
      }
      return true;
    }
  };
}
