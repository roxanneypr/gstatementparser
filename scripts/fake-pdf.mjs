// Renders positioned text pages (same shape as tests/fixtures/*.json) into a minimal, unencrypted
// PDF. Used to build FAKE statements for e2e tests and screenshots — never real data.
//   node scripts/fake-pdf.mjs tests/fixtures/gcash-basic.json out.pdf

import { readFileSync, writeFileSync } from "node:fs";

/** @param {import("../src/parsers/types.ts").PageText[]} pages */
export function pagesToPdf(pages) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e]/g, "?");
  /** @type {(string | null)[]} */
  const objs = [];
  const add = (s) => (objs.push(s), objs.length);
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  for (const p of pages) {
    const content = p.items
      .map(
        (i) =>
          `BT /F1 ${i.height} Tf ${i.x} ${(p.height - i.y).toFixed(2)} Td (${esc(i.str)}) Tj ET`,
      )
      .join("\n");
    const c = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${p.width} ${p.height}] ` +
          `/Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      ),
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node scripts/fake-pdf.mjs <fixture.json> <out.pdf>");
    process.exit(1);
  }
  writeFileSync(output, pagesToPdf(JSON.parse(readFileSync(input, "utf8")).pages));
}
