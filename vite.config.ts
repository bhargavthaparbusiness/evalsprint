import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { injectIcons, siteFooter, siteHeader } from "./src/web/site/layout.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "src/web");

/** Every top-level .html file in src/web is a page (index, app, privacy, …). */
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(/\.html$/, ""), path.join(root, f)]),
);

/** Injects the shared site layout and `<!-- icon:name -->` SVGs into static pages. */
function siteLayout(): Plugin {
  return {
    name: "site-layout",
    transformIndexHtml: {
      // Run before Vite's own HTML processing so injected <script> tags are bundled.
      order: "pre",
      handler(html, ctx) {
        const name = path.basename(ctx.filename, ".html");
        const page = name === "index" ? "/" : `/${name}`;
        if (!html.includes("<!-- @header -->")) return injectIcons(html);
        const withLayout = html
          .replace("<!-- @header -->", siteHeader(page))
          .replace("<!-- @footer -->", `${siteFooter(page)}\n    <script type="module" src="/site/nav.ts"></script>`);
        return injectIcons(withLayout);
      },
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
