import { expect, test } from "@playwright/test";

// Checks every built page (from the sitemap, plus 404) for the SEO requirements in CLAUDE.md.
test.describe("SEO", () => {
  test.skip(({ isMobile }) => isMobile, "page markup is the same on every device");

  test("sitemap and robots.txt", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap-index\.xml$/m);
    const sitemap = await (await request.get("/sitemap-0.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    expect(paths).toContain("/");
    expect(paths).toContain("/privacy");
    expect(paths.some((p) => p.includes("404") || p.includes("/dev/"))).toBe(false);
  });

  test("every page has complete, valid head tags", async ({ page, request }) => {
    const sitemap = await (await request.get("/sitemap-0.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    for (const path of [...paths, "/this-page-does-not-exist"]) {
      const res = await page.goto(path);
      const is404 = path === "/this-page-does-not-exist";
      expect(res?.status(), path).toBe(is404 ? 404 : 200);
      const info = await page.evaluate(() => ({
        title: document.title,
        description:
          document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
        h1: document.querySelectorAll("h1").length,
        lang: document.documentElement.lang,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        noindex: !!document.querySelector('meta[name="robots"][content*="noindex"]'),
        og: ["og:title", "og:description", "og:image", "og:url", "og:type"].filter(
          (p) => !document.querySelector(`meta[property="${p}"]`),
        ),
        jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
          (s) => s.textContent ?? "",
        ),
        imagesWithoutAlt: document.querySelectorAll("img:not([alt])").length,
      }));
      expect(info.title.length, `${path} title`).toBeGreaterThan(10);
      expect(info.title.length, `${path} title`).toBeLessThanOrEqual(60);
      expect(info.description.length, `${path} description`).toBeGreaterThan(50);
      expect(info.description.length, `${path} description`).toBeLessThanOrEqual(155);
      expect(info.h1, `${path} h1`).toBe(1);
      expect(info.lang, `${path} lang`).toMatch(/^(en|fil)$/);
      expect(info.og, `${path} missing OG tags`).toEqual([]);
      expect(info.imagesWithoutAlt, `${path} images without alt`).toBe(0);
      for (const json of info.jsonLd) expect(() => JSON.parse(json), path).not.toThrow();
      if (is404) {
        expect(info.noindex).toBe(true);
      } else {
        expect(info.noindex, `${path} noindex`).toBe(false);
        expect(new URL(info.canonical ?? "").pathname, `${path} canonical`).toBe(path);
      }
    }
  });

  test("the share image exists", async ({ request }) => {
    const res = await request.get("/og-image.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });
});
