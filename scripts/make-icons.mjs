// Generates every site icon from public/favicon.svg (the single source of the logo):
//   favicon.ico (16/32/48), apple-touch-icon.png (180), icon-192.png, icon-512.png
//   node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("public/favicon.svg", "utf8");
// Apple and Android apply their own corner mask, so those icons use a square (full-bleed) tile.
const squareSvg = svg.replace('rx="16" fill="#0b0d0e"', 'rx="0" fill="#0b0d0e"');
const dataUrl = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(source, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${dataUrl(source)}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** Minimal .ico containing PNG images (supported by all current browsers and Windows). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, png: await render(svg, size) });
writeFileSync("public/favicon.ico", ico(icoImages));
writeFileSync("public/apple-touch-icon.png", await render(squareSvg, 180));
writeFileSync("public/icon-192.png", await render(squareSvg, 192));
writeFileSync("public/icon-512.png", await render(squareSvg, 512));
await browser.close();
console.log("Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png");
