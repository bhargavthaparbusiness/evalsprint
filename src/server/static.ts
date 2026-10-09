import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * Resolves a URL path to a page or asset in `root`, mirroring the Vercel config
 * (`cleanUrls`): `/` → index.html, `/privacy` → privacy.html, `/assets/x.js` → file.
 * Returns undefined for anything outside `root` or not found.
 */
export async function resolveStaticFile(root: string, pathname: string): Promise<string | undefined> {
  const resolvedRoot = path.resolve(root);
  const clean = pathname.replace(/\/+$/, "") || "/";
  const candidates = clean === "/" ? ["index.html"] : [`.${clean}`, `.${clean}.html`];
  for (const candidate of candidates) {
    const full = path.resolve(resolvedRoot, candidate);
    if (full !== resolvedRoot && !full.startsWith(resolvedRoot + path.sep)) return undefined;
    try {
      if ((await stat(full)).isFile()) return full;
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

/** Serves the built site from `root`, with clean URLs and 404.html for unknown paths. */
export function createStaticHandler(root: string) {
  const resolvedRoot = path.resolve(root);

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
    let status = 200;
    let file = await resolveStaticFile(resolvedRoot, pathname);
    if (!file) {
      status = 404;
      file = await resolveStaticFile(resolvedRoot, "/404");
    }
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(status, {
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
