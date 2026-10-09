import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** Serves the built web UI from `root`, falling back to index.html for client routes. */
export function createStaticHandler(root: string) {
  const resolvedRoot = path.resolve(root);

  async function fileIfExists(candidate: string): Promise<string | undefined> {
    try {
      const info = await stat(candidate);
      return info.isFile() ? candidate : undefined;
    } catch {
      return undefined;
    }
  }

  return async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const requested = path.resolve(resolvedRoot, `.${pathname}`);
    const inside = requested === resolvedRoot || requested.startsWith(resolvedRoot + path.sep);
    const file =
      (inside ? await fileIfExists(requested) : undefined) ?? (await fileIfExists(path.join(resolvedRoot, "index.html")));
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}
