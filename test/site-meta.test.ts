import { describe, expect, it } from "vitest";
import { injectConstants, pageMeta, robotsTxt, sitemapXml } from "../src/web/site/layout.js";

const page = (head: string) => `<html><head><title>About — EvalSprint</title><meta name="description" content="A &quot;test&quot; page" />${head}</head></html>`;

describe("site metadata", () => {
  it("adds canonical and social tags on the canonical domain", () => {
    const meta = pageMeta("/about", page(""));
    expect(meta).toContain('<link rel="canonical" href="https://pitchvio.info/about" />');
    expect(meta).toContain('<meta property="og:url" content="https://pitchvio.info/about" />');
    expect(meta).toContain('<meta property="og:site_name" content="EvalSprint" />');
    expect(meta).toContain('<meta property="og:title" content="About — EvalSprint" />');
    expect(meta).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it("uses a trailing slash for the homepage and keeps /app distinct", () => {
    expect(pageMeta("/", page(""))).toContain('href="https://pitchvio.info/"');
    expect(pageMeta("/app", page(""))).toContain('href="https://pitchvio.info/app"');
  });

  it("does not duplicate tags a page already declares", () => {
    const meta = pageMeta("/", page('<meta property="og:title" content="Custom" />'));
    expect(meta).not.toContain("og:title");
  });

  it("gives noindex pages no canonical or og:url", () => {
    const meta = pageMeta("/404", page('<meta name="robots" content="noindex" />'));
    expect(meta).not.toContain("canonical");
    expect(meta).not.toContain("og:url");
  });

  it("lists public routes in the sitemap and points robots.txt at it", () => {
    const xml = sitemapXml();
    for (const route of ["/", "/app", "/about", "/contact", "/privacy", "/terms"]) {
      const loc = route === "/" ? "https://pitchvio.info/" : `https://pitchvio.info${route}`;
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect(xml).not.toContain("404");
    expect(xml).not.toContain("vercel.app");
    expect(robotsTxt()).toContain("Sitemap: https://pitchvio.info/sitemap.xml");
    expect(robotsTxt()).toContain("Disallow: /api/");
  });

  it("replaces site placeholders", () => {
    expect(injectConstants("%SITE_URL% %CONTACT_EMAIL%")).toBe("https://pitchvio.info contact@pitchvio.info");
  });
});
