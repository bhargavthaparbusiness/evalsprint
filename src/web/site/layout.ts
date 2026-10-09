/**
 * Shared header/footer for the static site pages. Injected at build time by the
 * `site-layout` Vite plugin (see vite.config.ts) so the pages ship as plain HTML
 * with no JavaScript. The mobile menu is a native <details> disclosure.
 */
import { iconSvg } from "../design/icons.js";

export const REPO_URL = "https://github.com/bhargavthaparbusiness/evalsprint";
export const DOCS_URL = `${REPO_URL}#readme`;
export const ISSUES_URL = `${REPO_URL}/issues`;

const NAV: { href: string; label: string }[] = [
  { href: "/#how", label: "How it works" },
  { href: "/#compare", label: "Compare" },
  { href: "/#cli", label: "CLI" },
  { href: DOCS_URL, label: "Docs" },
];

const LOGO = `<img src="/favicon.svg" alt="" width="24" height="24" />`;

function current(page: string, href: string): string {
  return page === href ? ' aria-current="page"' : "";
}

export function siteHeader(page: string): string {
  const links = NAV.map((l) => `<a href="${l.href}"${current(page, l.href)}>${l.label}</a>`).join("");
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="EvalSprint home">${LOGO}<span>EvalSprint</span></a>
    <nav class="site-nav" aria-label="Main">${links}</nav>
    <div class="header-actions">
      <a class="btn btn-ghost btn-icon header-gh" href="${REPO_URL}" aria-label="EvalSprint on GitHub">${iconSvg("github")}</a>
      <a class="btn btn-primary btn-sm header-cta" href="/app">Open app</a>
      <details class="mobile-nav">
        <summary class="btn btn-icon" aria-label="Menu">${iconSvg("menu", "icon icon-open")}${iconSvg("x", "icon icon-close")}</summary>
        <nav class="mobile-nav-panel" aria-label="Mobile">
          ${links}
          <a href="${REPO_URL}">${iconSvg("github")} GitHub</a>
          <a class="btn btn-primary" href="/app">Open the app ${iconSvg("arrowRight")}</a>
        </nav>
      </details>
    </div>
  </div>
</header>`;
}

export function siteFooter(page: string): string {
  const col = (title: string, items: [string, string][]) =>
    `<div><h2 class="footer-title">${title}</h2><ul>${items
      .map(([href, label]) => `<li><a href="${href}"${current(page, href)}>${label}</a></li>`)
      .join("")}</ul></div>`;
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-about">
      <a class="brand" href="/">${LOGO}<span>EvalSprint</span></a>
      <p>Regression tests for LLM prompts. Open source under the MIT License.</p>
    </div>
    ${col("Product", [["/app", "Open the app"], [DOCS_URL, "Documentation"], [REPO_URL, "GitHub"]])}
    ${col("Project", [["/about", "About"], ["/contact", "Contact"], [`${REPO_URL}/blob/main/LICENSE`, "MIT License"]])}
    ${col("Legal", [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"]])}
  </div>
  <div class="container footer-base">
    <span>EvalSprint is an open-source project. The public demo runs the mock provider only.</span>
  </div>
</footer>`;
}

/** Replaces `<!-- icon:name -->` placeholders in static pages with inline SVG. */
export function injectIcons(html: string): string {
  return html.replace(/<!--\s*icon:([a-zA-Z]+)\s*-->/g, (_, name: string) => iconSvg(name));
}
