/**
 * Shared header/footer for the static site pages. Injected at build time by the
 * `site-layout` Vite plugin (see vite.config.ts) so the pages ship as plain HTML
 * with no JavaScript.
 */
export const REPO_URL = "https://github.com/bhargavthaparbusiness/evalsprint";
export const DOCS_URL = `${REPO_URL}#readme`;
export const ISSUES_URL = `${REPO_URL}/issues`;

const NAV: { href: string; label: string }[] = [
  { href: "/#features", label: "Features" },
  { href: "/#quick-start", label: "Quick start" },
  { href: DOCS_URL, label: "Docs" },
  { href: REPO_URL, label: "GitHub" },
];

function current(page: string, href: string): string {
  return page === href ? ' aria-current="page"' : "";
}

export function siteHeader(page: string): string {
  const links = NAV.map((l) => `<a href="${l.href}"${current(page, l.href)}>${l.label}</a>`).join("");
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="EvalSprint home"><img src="/favicon.svg" alt="" width="26" height="26" /><span>EvalSprint</span></a>
    <nav class="site-nav" aria-label="Main">${links}<a class="btn btn-primary btn-sm" href="/app">Try the demo</a></nav>
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
      <a class="brand" href="/"><img src="/favicon.svg" alt="" width="22" height="22" /><span>EvalSprint</span></a>
      <p>Open-source regression testing for LLM prompts. MIT licensed.</p>
    </div>
    ${col("Product", [["/app", "Demo"], [DOCS_URL, "Documentation"], [REPO_URL, "GitHub"]])}
    ${col("Project", [["/about", "About"], ["/contact", "Contact"], [`${REPO_URL}/blob/main/LICENSE`, "MIT License"]])}
    ${col("Legal", [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"]])}
  </div>
</footer>`;
}
