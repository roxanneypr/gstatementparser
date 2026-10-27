// Renders a 1200x630 social share image from HTML.
//   node scripts/make-og-image.mjs                              -> public/og-image.png (GCash, home)
//   node scripts/make-og-image.mjs Maya public/og-maya.png      -> a bank landing page's image
// Uses the site's own look (not GCash brand colours) and fake numbers only.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [wallet = "GCash", out = "public/og-image.png"] = process.argv.slice(2);
const inter = readFileSync("public/fonts/inter-latin-wght-normal.woff2").toString("base64");
const icon = `data:image/svg+xml;base64,${readFileSync("public/favicon.svg").toString("base64")}`;

const rows = [
  ["Mar 01", "Payment", "−150.00", ""],
  ["Mar 02", "Received", "", "+2,500.00"],
  ["Mar 03", "Transfer", "−1,000.00", ""],
  ["Mar 04", "Refund", "", "+5.00"],
  ["Mar 05", "Payment", "−85.50", ""],
  ["Mar 10", "Payment", "−349.00", ""],
];

const html = /* html */ `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${inter}) format("woff2"); }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; font-family: Inter, sans-serif; font-feature-settings: "cv11", "ss01";
    background: #fff; color: #0b0d0e; display: flex; align-items: center; padding: 0 80px; gap: 64px;
    position: relative; overflow: hidden; -webkit-font-smoothing: antialiased; }
  body::before { content: ""; position: absolute; inset: 0;
    background-image: linear-gradient(to right, #ececee 1px, transparent 1px), linear-gradient(to bottom, #ececee 1px, transparent 1px);
    background-size: 48px 32px; -webkit-mask-image: radial-gradient(ellipse 60% 70% at 75% 50%, #000 10%, transparent 70%); }
  .text, .sheet { position: relative; }
  .text { flex: 1; }
  .logo { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 40px; }
  .logo img { width: 40px; height: 40px; }
  h1 { font-size: 64px; line-height: 1.04; font-weight: 600; letter-spacing: -0.045em; }
  h1 span { color: #a1a6ab; display: block; }
  .pill { display: inline-flex; align-items: center; gap: 10px; margin-top: 36px; padding: 10px 18px; border: 1px solid #dfe1e4;
    border-radius: 999px; font-size: 22px; color: #3d4247; background: #fff; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 4px #effaf3; }
  .sheet { width: 440px; background: #fff; border: 1px solid #dfe1e4; border-radius: 22px; overflow: hidden; font-size: 19px;
    box-shadow: 0 1px 2px rgb(16 18 20 / 4%), 0 12px 32px -12px rgb(16 18 20 / 14%), 0 40px 80px -40px rgb(16 18 20 / 20%); }
  .bar { height: 14px; background: #16a34a; }
  .row { display: grid; grid-template-columns: 92px 1fr 150px; border-top: 1px solid #ececee; font-variant-numeric: tabular-nums; }
  .row div { padding: 15px 18px; white-space: nowrap; }
  .row div:last-child { text-align: right; }
  .head { color: #6b7177; font-size: 14px; letter-spacing: .04em; text-transform: uppercase; background: #fafafa; border-top: 0; }
  .in { color: #15803d; font-weight: 600; }
</style></head><body>
  <div class="text">
    <p class="logo"><img src="${icon}" alt="">WalletToExcel</p>
    <h1>${wallet} statement to Excel, <span>in seconds.</span></h1>
    <p class="pill"><span class="dot"></span>Private by design. Nothing is uploaded.</p>
  </div>
  <div class="sheet">
    <div class="bar"></div>
    <div class="row head"><div>Date</div><div>Description</div><div>Amount</div></div>
    ${rows.map(([d, desc, out, inn]) => `<div class="row"><div>${d}</div><div>${desc}</div><div class="${inn ? "in" : ""}">${inn ? "+₱" + inn.slice(1) : "−₱" + out.slice(1)}</div></div>`).join("")}
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(`Wrote ${out}`);
