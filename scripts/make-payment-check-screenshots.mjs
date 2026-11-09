// Captures the screenshot for the "GCash reference number checker" blog post from the BUILT site,
// using only the FAKE sample statement and made-up reference numbers. Run after `npm run build`:
//   node scripts/make-payment-check-screenshots.mjs
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "src/content/blog/images/gcash-reference-number-checker";
const PORT = 4338;
mkdirSync(OUT, { recursive: true });

const server = spawn("node", ["scripts/serve-dist.mjs", "dist", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await page.waitForSelector("#state-done:not([hidden])");
  // Lines as the screenshot reader writes them (reference, amount, date), plus one typed amount.
  await page.fill(
    "#payments-input",
    [
      "4000000000001 ₱5,000.00 Mar 1, 2026",
      "4000000000010 ₱3,000.00 Mar 14, 2026",
      "4000000000099 ₱1,500.00 Mar 20, 2026",
      "4000000000120 ₱800.00 May 3, 2026",
      "₱1,200.00 Apr 5, 2026",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Check payments" }).click();
  await page.locator("#payments-input").blur();
  // Show every line in the box (it scrolls in the real page).
  await page.locator("#payments-input").evaluate((t) => {
    t.style.height = `${t.scrollHeight + 4}px`;
    t.scrollTop = 0;
  });
  await page
    .locator("#payments")
    .screenshot({ path: join(OUT, "1-results.png"), animations: "disabled" });
  console.log(`Wrote screenshots to ${OUT}`);
} finally {
  await browser.close();
  server.kill();
}
