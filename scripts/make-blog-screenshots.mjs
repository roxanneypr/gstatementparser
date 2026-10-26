// Captures screenshots for the "GCash statement to Excel" blog post from the BUILT site, using only
// the FAKE sample statement. Run after `npm run build`:
//   node scripts/make-blog-screenshots.mjs
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pagesToPdf } from "./fake-pdf.mjs";
import { sampleStatementPages } from "./sample-statement.mjs";

const OUT = "src/content/blog/images/gcash-statement-to-excel-guide";
const PORT = 4337;
mkdirSync(OUT, { recursive: true });

// Same fake statement, password-protected, so the password step can be shown.
const dir = mkdtempSync(join(tmpdir(), "w2e-"));
const protectedPdf = join(dir, "sample-gcash-statement.pdf");
writeFileSync(protectedPdf, pagesToPdf(sampleStatementPages(), { password: "sample" }));

const server = spawn("node", ["scripts/serve-dist.mjs", "dist", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 2,
  });
  const shot = (selector, name) =>
    page
      .locator(selector)
      .first()
      .screenshot({ path: join(OUT, `${name}.png`), animations: "disabled" });

  await page.goto(`http://localhost:${PORT}/`);
  await shot("#panel", "1-choose");

  await page.setInputFiles("#pdf-file", protectedPdf);
  await page.waitForSelector("#state-password:not([hidden])");
  await page.fill("#pdf-password", "sample");
  await page.locator("#pdf-password").blur();
  await shot("#panel", "2-password");

  await page.click("#state-password button[type=submit]");
  await page.waitForSelector("#state-done:not([hidden])");
  await page.locator("#done-title").blur();
  await shot("#panel", "3-ready");
  await shot(".overview", "4-overview");
  await shot("#review", "6-review");
  await page.click('[data-filter="in"]');
  await shot(".block:has(#tx-body)", "7-transactions");
  console.log(`Wrote screenshots to ${OUT}`);
} finally {
  await browser.close();
  server.kill();
}
