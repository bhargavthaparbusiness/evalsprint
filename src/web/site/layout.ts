/**
 * Shared header/footer, SEO metadata and site constants for the static pages.
 * Injected at build time by the `site-layout` Vite plugin (see vite.config.ts)
 * so the pages ship as plain HTML. The mobile menu is a native <details>
 * disclosure; a tiny same-origin script (site/nav.ts) only closes it.
 */
import { iconSvg } from "../design/icons.js";

/**
 * Canonical public origin. Used for canonical links, Open Graph/Twitter tags,
 * sitemap.xml and robots.txt. The Vercel URL (evalsprint.vercel.app) remains a
 * working fallback; its pages point search engines here via rel=canonical.
 */
export const SITE_URL = "https://pitchvio.info";
export const SITE_NAME = "EvalSprint";
/** Public product/business contact address (receiving only; see /privacy). */
export const CONTACT_EMAIL = "contact@pitchvio.info";
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
    ${col("Project", [["/about", "About"], ["/contact", "Contact"], [`mailto:${CONTACT_EMAIL}`, CONTACT_EMAIL], [`${REPO_URL}/blob/main/LICENSE`, "MIT License"]])}
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

/** Public routes listed in sitemap.xml (the 404 page is deliberately excluded). */
export const PUBLIC_ROUTES = ["/", "/app", "/about", "/contact", "/privacy", "/terms"] as const;

export function absoluteUrl(route: string): string {
  return route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Builds canonical + Open Graph + Twitter tags for a page from its own <title>
 * and meta description. Tags a page already declares (e.g. a custom og:title)
 * are left alone. Pages marked noindex (the 404) get no canonical or og:url.
 */
export function pageMeta(route: string, html: string): string {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? SITE_NAME;
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const has = (needle: string) => html.includes(needle);
  const url = absoluteUrl(route);
  const image = `${SITE_URL}/screenshots/compare.jpg`;
  const tags: string[] = [];
  if (!noindex && !has('rel="canonical"')) tags.push(`<link rel="canonical" href="${url}" />`);
  if (!has('property="og:site_name"')) tags.push(`<meta property="og:site_name" content="${SITE_NAME}" />`);
  if (!has('property="og:type"')) tags.push(`<meta property="og:type" content="website" />`);
  if (!noindex && !has('property="og:url"')) tags.push(`<meta property="og:url" content="${url}" />`);
  if (!has('property="og:title"')) tags.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
  if (description && !has('property="og:description"')) {
    tags.push(`<meta property="og:description" content="${escapeAttr(description)}" />`);
  }
  if (!has('property="og:image"')) {
    tags.push(`<meta property="og:image" content="${image}" />`);
    tags.push(`<meta property="og:image:alt" content="EvalSprint comparing two prompt versions on the same test cases" />`);
  }
  if (!has('name="twitter:card"')) tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  return tags.map((t) => `    ${t}`).join("\n");
}

export function sitemapXml(): string {
  const urls = PUBLIC_ROUTES.map((route) => `  <url><loc>${absoluteUrl(route)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/** Replaces %SITE_URL% / %CONTACT_EMAIL% placeholders in page markup. */
export function injectConstants(html: string): string {
  return html.replaceAll("%SITE_URL%", SITE_URL).replaceAll("%CONTACT_EMAIL%", CONTACT_EMAIL);
}
