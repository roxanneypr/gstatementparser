// DEV ONLY: node scripts/dump-pdf.mjs <file.pdf> [--password=...] [--raw]
// Prints positioned text rows to stdout. Redacts digits/emails unless --raw. Never writes files.
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { formatPageDump, toPageText } from "../src/pdf/pageText.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const password =
  args.find((a) => a.startsWith("--password="))?.slice("--password=".length) ??
  process.env.PDF_PASSWORD;
const redact = !args.includes("--raw");

if (!file) {
  console.error("usage: node scripts/dump-pdf.mjs <file.pdf> [--password=...] [--raw]");
  process.exit(1);
}

const task = getDocument({
  data: new Uint8Array(await readFile(file)),
  password,
  verbosity: 0,
});
const doc = await task.promise;

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const { width, height } = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  console.log(formatPageDump(toPageText(n, height, width, content.items), redact));
  console.log();
}
await task.destroy();
