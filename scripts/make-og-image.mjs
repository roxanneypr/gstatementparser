// Renders public/og-image.png (1200x630 social share image) from HTML.
//   node scripts/make-og-image.mjs
// Uses the site's own colours (not GCash brand colours) and fake numbers only.
import { chromium } from "@playwright/test";

const html = /* html */ `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f5f7f6; color: #16201b; display: flex; align-items: center; padding: 72px; gap: 56px; }
  .text { flex: 1; }
  h1 { font-size: 68px; line-height: 1.05; letter-spacing: -1.5px; }
  p { font-size: 30px; color: #4d5a53; margin-top: 24px; line-height: 1.3; }
  .badge { display: inline-block; margin-top: 36px; background: #1f7a4d; color: #fff; font-size: 26px;
    font-weight: 600; padding: 14px 24px; border-radius: 999px; }
  .sheet { width: 440px; background: #fff; border: 2px solid #d5ddd8; border-radius: 18px; overflow: hidden;
    box-shadow: 0 18px 40px rgba(22,32,27,.12); font-size: 20px; }
  .row { display: grid; grid-template-columns: 0.8fr 1.3fr 1.3fr; border-top: 1px solid #e3e9e5; }
  .row div { padding: 14px 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row div:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .head { background: #1f7a4d; color: #fff; font-weight: 700; border-top: 0; }
  .in { color: #1f7a4d; font-weight: 600; }
</style></head><body>
  <div class="text">
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
await page.screenshot({ path: "public/og-image.png" });
await browser.close();
console.log("Wrote public/og-image.png");
