// Renders public/og-image.png (1200x630 social share image) from HTML.
//   node scripts/make-og-image.mjs
// Uses the site's own colours (not GCash brand colours) and fake numbers only.
import { chromium } from "@playwright/test";

import { readFileSync } from "node:fs";

const font = (weight) =>
  `@font-face { font-family: Poppins; font-weight: ${weight}; src: url(data:font/woff2;base64,${readFileSync(
    `public/fonts/poppins-latin-${weight}-normal.woff2`,
  ).toString("base64")}) format("woff2"); }`;

const icon = `data:image/svg+xml;base64,${readFileSync("public/favicon.svg").toString("base64")}`;

const html = /* html */ `<!doctype html><html><head><meta charset="utf-8"><style>
  ${font(400)} ${font(600)}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; font-family: Poppins, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f1f0ef; color: #16201b; display: flex; align-items: center; padding: 72px; gap: 56px; }
  .text { flex: 1; }
  .logo { display: flex; align-items: center; gap: 12px; margin: 0 0 28px; font-size: 30px; font-weight: 600; color: #1b1d21; }
  .mark { width: 40px; height: 40px; }
  h1 { font-size: 56px; white-space: nowrap; line-height: 1.1; font-weight: 600; letter-spacing: -1px; }
  p { font-size: 28px; color: #4d5a53; margin-top: 20px; line-height: 1.3; }
  .badge { display: inline-block; margin-top: 36px; background: #4359c9; color: #fff; font-size: 26px;
    font-weight: 600; padding: 14px 24px; border-radius: 999px; }
  .sheet { width: 440px; background: #fff; border: 2px solid #d5ddd8; border-radius: 18px; overflow: hidden;
    box-shadow: 0 18px 40px rgba(22,32,27,.12); font-size: 20px; }
  .row { display: grid; grid-template-columns: 0.8fr 1.3fr 1.3fr; border-top: 1px solid #e3e9e5; }
  .row div { padding: 14px 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row div:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .head { background: #4359c9; color: #fff; font-weight: 700; border-top: 0; }
  .in { color: #1a7f4b; font-weight: 600; }
</style></head><body>
  <div class="text">
    <p class="logo"><img class="mark" src="${icon}" alt="">WalletToExcel</p>
    <h1>GCash Statement<br>to Excel</h1>
    <p>Convert your transaction history PDF to Excel or CSV in seconds. Free.</p>
    <span class="badge">🔒 Private: nothing is uploaded</span>
  </div>
  <div class="sheet" aria-hidden="true">
    <div class="row head"><div>Date</div><div>Description</div><div>Amount</div></div>
    <div class="row"><div>Mar 1</div><div>Payment</div><div>−₱150.00</div></div>
    <div class="row"><div>Mar 2</div><div>Received</div><div class="in">+₱2,500.00</div></div>
    <div class="row"><div>Mar 3</div><div>Transfer</div><div>−₱1,000.00</div></div>
    <div class="row"><div>Mar 4</div><div>Refund</div><div class="in">+₱5.00</div></div>
    <div class="row"><div>Mar 5</div><div>Payment</div><div>−₱85.50</div></div>
    <div class="row"><div>Mar 10</div><div>Payment</div><div>−₱349.00</div></div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/og-image.png" });
await browser.close();
console.log("Wrote public/og-image.png");
