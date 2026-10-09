import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticHandler, resolveStaticFile } from "../src/server/static.js";

let root: string;
let server: Server;
let base: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "pitchvioevals-static-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "index.html"), "home");
  await writeFile(path.join(root, "app.html"), "app");
  await writeFile(path.join(root, "privacy.html"), "privacy");
  await writeFile(path.join(root, "404.html"), "not found page");
  await writeFile(path.join(root, "assets", "x.js"), "js");
  await writeFile(path.join(path.dirname(root), "secret.txt"), "secret");
  const serve = createStaticHandler(root);
  server = createServer((req, res) => void serve(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
  await rm(path.join(path.dirname(root), "secret.txt"), { force: true });
});

describe("static site serving", () => {
  it("maps clean URLs to pages, like Vercel cleanUrls", async () => {
    for (const [url, body] of [["/", "home"], ["/app", "app"], ["/app/", "app"], ["/privacy", "privacy"], ["/privacy.html", "privacy"], ["/assets/x.js", "js"]]) {
      const res = await fetch(base + url);
      expect(res.status, url).toBe(200);
      expect(await res.text(), url).toBe(body);
    }
  });

  it("serves 404.html with a 404 status for unknown paths", async () => {
    const res = await fetch(`${base}/no-such-page`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("not found page");
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("never resolves files outside the root", async () => {
    expect(await resolveStaticFile(root, "/../secret.txt")).toBeUndefined();
    expect(await resolveStaticFile(root, "/../secret")).toBeUndefined();
    const res = await fetch(`${base}/%2e%2e/secret.txt`);
    expect(await res.text()).not.toBe("secret");
  });
});
