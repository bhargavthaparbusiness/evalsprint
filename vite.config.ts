import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  injectConstants,
  injectIcons,
  pageMeta,
  robotsTxt,
  siteFooter,
  siteHeader,
  sitemapXml,
} from "./src/web/site/layout.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "src/web");

/** Every top-level .html file in src/web is a page (index, app, privacy, …). */
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(/\.html$/, ""), path.join(root, f)]),
);

/**
 * Injects the shared site layout, SEO metadata (canonical, Open Graph, Twitter),
 * site constants and `<!-- icon:name -->` SVGs into every page, and emits
 * sitemap.xml and robots.txt for the canonical domain.
 */
function siteLayout(): Plugin {
  return {
    name: "site-layout",
    transformIndexHtml: {
      // Run before Vite's own HTML processing so injected <script> tags are bundled.
      order: "pre",
      handler(html, ctx) {
        const name = path.basename(ctx.filename, ".html");
        const page = name === "index" ? "/" : `/${name}`;
        let out = html.replace("</head>", `${pageMeta(page, html)}\n  </head>`);
        if (out.includes("<!-- @header -->")) {
          out = out
            .replace("<!-- @header -->", siteHeader(page))
            .replace("<!-- @footer -->", `${siteFooter(page)}\n    <script type="module" src="/site/nav.ts"></script>`);
        }
        return injectIcons(injectConstants(out));
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const body = req.url === "/sitemap.xml" ? sitemapXml() : req.url === "/robots.txt" ? robotsTxt() : null;
        if (body === null) return next();
        res.setHeader("Content-Type", req.url === "/sitemap.xml" ? "application/xml" : "text/plain; charset=utf-8");
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml() });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt() });
    },
  };
}

export default defineConfig({
  root,
  plugins: [react(), siteLayout()],
  appType: "mpa",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    // Never inline fonts as data: URIs — the CSP only allows same-origin fonts.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    rollupOptions: { input: pages },
  },
});
