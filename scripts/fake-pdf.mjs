// Renders positioned text pages (same shape as tests/fixtures/*.json) into a minimal PDF,
// optionally password-protected. Used to build FAKE statements for e2e tests and screenshots —
// never real data.
//   node scripts/fake-pdf.mjs tests/fixtures/gcash-basic.json out.pdf [password]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// PDF Standard Security Handler, revision 2 (40-bit RC4), PDF 1.7 spec §7.6.3.
const PAD = Buffer.from("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A", "hex");
const FILE_ID = Buffer.from("00112233445566778899aabbccddeeff", "hex");
const PERMISSIONS = -4;

const md5 = (...parts) => createHash("md5").update(Buffer.concat(parts)).digest();

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

const padPassword = (pw) => Buffer.concat([Buffer.from(pw, "latin1"), PAD]).subarray(0, 32);

function encryption(password) {
  const padded = padPassword(password);
  const owner = rc4(md5(padded).subarray(0, 5), padded); // owner password = user password
  const p = Buffer.alloc(4);
  p.writeInt32LE(PERMISSIONS);
  const key = md5(padded, owner, p, FILE_ID).subarray(0, 5);
  const user = rc4(key, PAD);
  const objectKey = (num) => {
    const suffix = Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0]);
    return md5(key, suffix).subarray(0, 10);
  };
  const dict = `<< /Filter /Standard /V 1 /R 2 /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /P ${PERMISSIONS} >>`;
  return { dict, objectKey };
}

/**
 * @param {import("../src/parsers/types.ts").PageText[]} pages
 * @param {{ password?: string }} [options]
 */
export function pagesToPdf(pages, options = {}) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e]/g, "?");
  const enc = options.password !== undefined ? encryption(options.password) : null;

  /** @type {({ dict: string } | { stream: Buffer } | null)[]} */
  const objs = [];
  const add = (o) => (objs.push(o), objs.length);
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add({ dict: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" });
  const kids = [];
  for (const p of pages) {
    const content = p.items
      .map(
        (i) =>
          `BT /F1 ${i.height} Tf ${i.x} ${(p.height - i.y).toFixed(2)} Td (${esc(i.str)}) Tj ET`,
      )
      .join("\n");
    const c = add({ stream: Buffer.from(content, "latin1") });
    kids.push(
      add({
        dict:
          `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${p.width} ${p.height}] ` +
          `/Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      }),
    );
  }
  objs[catalog - 1] = { dict: `<< /Type /Catalog /Pages ${pagesObj} 0 R >>` };
  objs[pagesObj - 1] = {
    dict: `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`,
  };
  const encryptObj = enc ? add({ dict: enc.dict }) : 0;

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  let length = chunks[0].length;
  const push = (b) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    chunks.push(buf);
    length += buf.length;
  };
  const offsets = [];
  objs.forEach((o, i) => {
    const num = i + 1;
    offsets.push(length);
    push(`${num} 0 obj\n`);
    if (o && "stream" in o) {
      const data = enc ? rc4(enc.objectKey(num), o.stream) : o.stream;
      push(`<< /Length ${data.length} >>\nstream\n`);
      push(data);
      push("\nendstream");
    } else if (o) {
      push(o.dict);
    }
    push("\nendobj\n");
  });
  const xref = length;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
  push(offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join(""));
  const id = FILE_ID.toString("hex");
  const trailerExtra = enc ? ` /Encrypt ${encryptObj} 0 R /ID [<${id}> <${id}>]` : "";
  push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R${trailerExtra} >>\n`);
  push(`startxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output, password] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node scripts/fake-pdf.mjs <fixture.json> <out.pdf> [password]");
    process.exit(1);
  }
  writeFileSync(output, pagesToPdf(JSON.parse(readFileSync(input, "utf8")).pages, { password }));
}
