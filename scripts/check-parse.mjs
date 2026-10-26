// DEV ONLY: node scripts/check-parse.mjs <file.pdf> [--password=...] [--raw]
// Runs the real parser on a local PDF and prints a summary + warnings (digits redacted unless --raw).
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { redactText, toPageText } from "../src/pdf/pageText.ts";
import { detectParser } from "../src/parsers/index.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const password =
  args.find((a) => a.startsWith("--password="))?.slice("--password=".length) ??
  process.env.PDF_PASSWORD;
const show = args.includes("--raw") ? (s) => s : redactText;
if (!file) {
  console.error("usage: node scripts/check-parse.mjs <file.pdf> [--password=...] [--raw]");
  process.exit(1);
}

const task = getDocument({ data: new Uint8Array(await readFile(file)), password, verbosity: 0 });
const doc = await task.promise;
const pages = [];
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const { width, height } = page.getViewport({ scale: 1 });
  pages.push(toPageText(n, height, width, (await page.getTextContent()).items));
}
await task.destroy();

const parser = detectParser(pages);
if (!parser) {
  console.log("No parser recognised this PDF.");
  process.exit(1);
}
const r = parser.parse(pages);
const flagged = r.transactions.filter((t) => t.flags?.length).length;
const unchanged = r.transactions.filter((t) => t.balanceIssue?.kind === "unchanged").length;
const different = r.transactions.filter((t) => t.balanceIssue?.kind === "different").length;
console.log(`parser: ${parser.id}`);
console.log(`transactions: ${r.transactions.length} (rows with read problems: ${flagged})`);
console.log(`balance gaps: ${unchanged} unchanged, ${different} different`);
console.log(`period found: ${Boolean(r.periodStart && r.periodEnd)}`);
console.log(
  `opening found: ${r.openingBalance !== undefined}, closing found: ${r.closingBalance !== undefined}`,
);
console.log(`checks: ${JSON.stringify(r.checks)}`);
console.log(`warnings: ${r.warnings.length}`);
for (const w of r.warnings) console.log("  - " + show(w));
