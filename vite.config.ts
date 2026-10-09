import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { siteFooter, siteHeader } from "./src/web/site/layout.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "src/web");

/** Every top-level .html file in src/web is a page (index, app, privacy, …). */
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(/\.html$/, ""), path.join(root, f)]),
);

/** Replaces <!-- @header --> / <!-- @footer --> with the shared site layout. */
function siteLayout(): Plugin {
  return {
    name: "site-layout",
    transformIndexHtml(html, ctx) {
      const name = path.basename(ctx.filename, ".html");
      const page = name === "index" ? "/" : `/${name}`;
      return html.replace("<!-- @header -->", siteHeader(page)).replace("<!-- @footer -->", siteFooter(page));
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
    rollupOptions: { input: pages },
  },
});
