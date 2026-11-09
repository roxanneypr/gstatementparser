// DEV ONLY: node scripts/check-receipts.mjs [folder=samples/private]
// Runs "Add screenshots" from the built site (dist/, `npm run build` first) on every image in the
// folder, in a real browser, and prints what was read per file. Prints to the console only: real
// receipts hold personal data, so never save this output to a committed file.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "samples/private";
const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|heic)$/i.test(f));
const port = 4399;
const server = spawn("node", ["scripts/serve-dist.mjs", "dist", String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.goto(`http://localhost:${port}/`);
  await page.getByRole("button", { name: "Try a sample statement" }).click();
  await page.locator("#state-done").waitFor();
  for (const f of files) {
    await page.locator("#payments-input").fill("");
    await page.locator("#payments-notes").evaluate((n) => (n.textContent = ""));
    await page.locator("#payments-images").setInputFiles(join(dir, f));
    await page.waitForFunction(
      () =>
        !document.querySelector("#payments-add-images")?.hasAttribute("disabled") &&
        document.querySelector("#payments-notes")?.textContent?.match(/Read|found|opened|load/),
      null,
      { timeout: 60_000 },
    );
    const line = await page.locator("#payments-input").inputValue();
    const notes = await page.locator("#payments-notes").textContent();
    console.log(`${f.padEnd(16)} ${line || "(nothing)"}${line ? "" : `  — ${notes}`}`);
  }
} finally {
  await browser.close();
  server.kill();
}
