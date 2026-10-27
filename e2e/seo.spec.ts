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

  test("site icons are served and linked", async ({ request, page }) => {
    for (const [path, type] of [
      ["/favicon.ico", "image/"],
      ["/favicon.svg", "image/svg+xml"],
      ["/apple-touch-icon.png", "image/png"],
      ["/icon-192.png", "image/png"],
      ["/icon-512.png", "image/png"],
      ["/site.webmanifest", ""],
    ] as const) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"] ?? "", path).toContain(type);
    }
    await page.goto("/");
    await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test("the share image exists", async ({ request }) => {
    const res = await request.get("/og-image.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });
});

test.describe("content", () => {
  test("home has a compact 4-question FAQ, collapsed, with FAQPage data", async ({ page }) => {
    await page.goto("/");
    const items = page.locator(".faq details");
    await expect(items).toHaveCount(4);
    for (const d of await items.all()) expect(await d.getAttribute("open")).toBeNull();
    const types = await page.$$eval('script[type="application/ld+json"]', (s) =>
      s.map((x) => JSON.parse(x.textContent ?? "{}")["@type"]),
    );
    expect(types).toContain("FAQPage");
    await expect(page.locator('.faq a[href="/blog/gcash-statement-to-excel-guide"]')).toHaveCount(
      1,
    );
  });

  test("published blog: listed, linked from the footer, images have alt text", async ({ page }) => {
    await page.goto("/");
    await page.locator('footer a[href="/blog"]').click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.locator(".post-card")).toHaveCount(3);
    await page.locator('a.post-card[href="/blog/gcash-statement-to-excel-guide"]').click();
    await expect(page.locator("h1")).toHaveText("GCash Statement to Excel: Step-by-Step Guide");
    const images = page.locator(".prose img");
    expect(await images.count()).toBeGreaterThanOrEqual(5);
    for (const img of await images.all()) {
      expect((await img.getAttribute("alt"))?.length ?? 0).toBeGreaterThan(20);
    }
    await expect(page.locator(".draft-banner")).toHaveCount(0);
  });
});

test("one-tap bank vote sends only the bank name and says thanks", async ({ page }) => {
  const bodies: string[] = [];
  await page.route("**/api/vote", async (route) => {
    bodies.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto("/");
  const chips = page.locator(".bank-chip");
  await expect(chips).toHaveText(["GoTyme", "BPI", "BDO", "SeaBank", "UnionBank", "Other"]);
  await expect(page.locator(".cta-band")).not.toContainText("roadmap");

  await page.getByRole("button", { name: "GoTyme" }).click();
  await expect(page.locator("#vote-status")).toHaveText("Thanks! GoTyme noted ✓");
  await expect(page.getByRole("button", { name: "GoTyme" })).toHaveAttribute("aria-pressed", "true");
  expect(bodies).toEqual(['{"bank":"GoTyme"}']);

  // Remembered on this device: no second vote.
  await page.reload();
  await page.getByRole("button", { name: "GoTyme" }).click();
  await expect(page.locator("#vote-status")).toHaveText("Thanks! GoTyme is already noted ✓");
  expect(bodies).toHaveLength(1);
});

test("bank vote falls back to email when it can't be sent", async ({ page }) => {
  await page.route("**/api/vote", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "BDO" }).click();
  await expect(page.locator("#vote-fallback")).toBeVisible();
  await expect(page.locator("#vote-fallback-link")).toHaveAttribute(
    "href",
    "mailto:hello@wallettoexcel.com?subject=Please%20add%20BDO",
  );
});
