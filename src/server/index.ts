import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./api.js";
import { loadDotEnv } from "./env.js";
import { createStaticHandler, resolveStaticFile } from "./static.js";

const thisFile = fileURLToPath(import.meta.url);
// Both src/server/index.ts (dev, via tsx) and dist/server/index.js (built) sit two levels below the root.
const projectRoot = path.resolve(path.dirname(thisFile), "../..");
const isBuilt = thisFile.endsWith(".js");

loadDotEnv(process.cwd());

const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number.parseInt(process.env.PORT?.trim() || "5050", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[evalsprint] Invalid PORT "${process.env.PORT}"`);
  process.exit(1);
}

const handleApi = createApiHandler();
type Fallback = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
let fallback: Fallback;

const server = createServer((req, res) => {
  void (async () => {
    if (await handleApi(req, res)) return;
    await fallback(req, res);
  })().catch((error: unknown) => {
    console.error("[evalsprint] request failed:", error);
    if (!res.headersSent) res.writeHead(500).end("Internal server error");
  });
});

if (isBuilt) {
  const webRoot = path.join(projectRoot, "dist", "web");
  if (!existsSync(path.join(webRoot, "index.html"))) {
    console.error("[evalsprint] dist/web is missing. Run `npm run build` first, or use `npm run dev`.");
    process.exit(1);
  }
  fallback = createStaticHandler(webRoot);
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: path.join(projectRoot, "vite.config.ts"),
    server: { middlewareMode: true, hmr: { server } },
    appType: "mpa",
  });
  const webRoot = path.join(projectRoot, "src", "web");
  fallback = async (req, res) => {
    // Clean URLs in dev, matching production: /privacy → /privacy.html.
    const url = new URL(req.url ?? "/", "http://localhost");
    const page = await resolveStaticFile(webRoot, url.pathname);
    if (page?.endsWith(".html")) req.url = `/${path.relative(webRoot, page)}${url.search}`;
    vite.middlewares(req, res, () => {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    });
  };
}

server.listen(port, host, () => {
  const shownHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  console.log(`EvalSprint ${isBuilt ? "" : "(dev) "}running at http://${shownHost}:${port}`);
  console.log(
    process.env.ANTHROPIC_API_KEY?.trim()
      ? "Anthropic provider: enabled (ANTHROPIC_API_KEY found in server environment)"
      : "Anthropic provider: disabled (set ANTHROPIC_API_KEY to enable). Mock provider is always available.",
  );
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    console.warn(
      `[evalsprint] Warning: listening on ${host}. Anyone who can reach this port can run evaluations` +
        " and, if configured, spend your Anthropic API credits. There is no authentication.",
    );
  }
});
