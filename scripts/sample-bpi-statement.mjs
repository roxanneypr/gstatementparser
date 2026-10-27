// FAKE BPI account statements (positioned text pages, ready for scripts/fake-pdf.mjs). All names,
// numbers, merchants and amounts are made up. Transaction wording ("InstaPay Transfer", "TRANSFER
// TO OTHER BANK", "Bizlink Payroll", ...) is as seen on a real BPI statement; merchant names are
// obviously fake. Layout mirrors the real statement (see src/parsers/bpi.ts), including its
// letter-spaced text: every character is followed by a space, as pdf.js reads the real PDF.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const cap = (m) => m[0] + m.slice(1).toLowerCase();

/** "DEBIT AMOUNT" -> "D E B I T A M O U N T" (word gaps look like letter gaps, as on the real PDF). */
const spaced = (s) => s.replace(/\s+/g, "").split("").join(" ");
// Helvetica advance widths (per 1000 em): scripts/fake-pdf.mjs draws every item in Helvetica at
// its height, so declared widths must match or neighbouring words overlap and pdf.js merges them.
const HELVETICA = {
  " ": 278,
  ",": 278,
  ".": 278,
  ":": 278,
  "-": 333,
  "@": 1015,
  "*": 389,
  "#": 556,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
};
const W = (s, h) =>
  Math.round(([...s].reduce((sum, c) => sum + (HELVETICA[c] ?? 556), 0) * h) / 100) / 10;

function item(str, x, y, { right, h = 4.7 } = {}) {
  const s = spaced(str);
  const width = W(s, h);
  return {
    str: s,
    x: right !== undefined ? Math.round((right - width) * 10) / 10 : x,
    y,
    width,
    height: h,
  };
}
/** Words as separate items, the way pdf.js splits description text on the real statement. */
function words(text, x, y) {
  const out = [];
  for (const w of text.split(" ")) {
    const it = item(w, x, y);
    out.push(it);
    // A gap over 0.6 em keeps pdf.js from merging the words (real statement: ~0.62 em).
    x = Math.round((x + it.width + 4) * 10) / 10;
  }
  return out;
}
const peso = (centavos) =>
  (centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const periodText = ({ start, end }) =>
  `${MONTHS[start.m - 1]} ${start.d}, ${start.y} - ${MONTHS[end.m - 1]} ${end.d}, ${end.y}`;

const RIGHT = { debit: 431, credit: 501.5, balance: 573.5 };
const ROW = 7.8;

/**
 * @param {object} o
 * @param {{start:{y,m,d}, end:{y,m,d}}} o.period
 * @param {number} o.opening centavos
 * @param {Array<[number, number, string, string, string, number, number]>} o.rows
 *   [month, day, description, ref, details, debit centavos, credit centavos]
 * @param {number} [o.rowsPerPage]
 */
export function bpiStatementPages({ period, opening, rows, rowsPerPage = 45 }) {
  const totalDebit = rows.reduce((s, r) => s + r[5], 0);
  const totalCredit = rows.reduce((s, r) => s + r[6], 0);
  const closing = opening + totalCredit - totalDebit;
  const tablePages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  // Page 1 (summary) and a blank back page, then each table page followed by a blank back page.
  const pageCount = 2 + tablePages * 2;
  const pages = [];

  const top = (n) => [
    item("SAMPLE BRANCH", 300, 90, { h: 5.1 }),
    item("SAVINGS ACCOUNT - PHP", 484.2, 90, { h: 6.2 }),
    item(`Page ${n} of ${pageCount}`, 504, 122.4),
  ];

  pages.push({
    pageNumber: 1,
    width: 612,
    height: 792,
    items: [
      ...top(1),
      item("JUAN DELA CRUZ", 36, 126, { h: 6.2 }),
      item("0000-0000-00", 504, 144),
      item(`ACCOUNT SUMMARY FOR THE PERIOD ${periodText(period)}`, 36, 264.9, { h: 5.4 }),
      item("Beginning Balance", 43.2, 288),
      item(peso(opening), 0, 288, { right: 334 }),
      item("Plus: Total Credits", 43.2, 321),
      item(peso(totalCredit), 0, 321, { right: 334 }),
      item("Less: Total Debits", 43.2, 415.2),
      item(peso(totalDebit), 0, 415.2, { right: 334 }),
      item("Ending Balance", 43.2, 509.4),
      item(peso(closing), 0, 509.4, { right: 334 }),
    ],
  });
  pages.push({
    pageNumber: 2,
    width: 612,
    height: 792,
    items: [item("Page 2 of " + pageCount, 504, 79.2)],
  });

  let balance = opening;
  for (let t = 0; t < tablePages; t++) {
    const n = 3 + t * 2;
    const items = [
      ...top(n),
      item(`PERIOD COVERED ${periodText(period)}`, 36, 136.8, { h: 5.4 }),
      item("NO: 0000-0000-00", 518.4, 136.8, { h: 5.4 }),
      item("DATE", 36, 163.8, { h: 5.4 }),
      item("DESCRIPTION", 97.2, 163.8, { h: 5.4 }),
      item("REF", 199.8, 163.8, { h: 5.4 }),
      item("DETAILS", 266.4, 163.8, { h: 5.4 }),
      item("DEBIT AMOUNT", 375.9, 163.8, { h: 5.4 }),
      item("CREDIT AMOUNT", 444.9, 163.8, { h: 5.4 }),
      item("BALANCE", 522, 163.8, { h: 5.4 }),
    ];
    let y = 194.4;
    if (t === 0) {
      items.push(
        ...words("BEGINNING BALANCE", 65.4, y),
        item(peso(opening), 0, y, { right: RIGHT.balance, h: 5.4 }),
      );
    }
    y += 16.2;
    for (const r of rows.slice(t * rowsPerPage, (t + 1) * rowsPerPage)) {
      const [month, day, desc, ref, details, debit, credit] = r;
      balance += credit - debit;
      items.push(item(cap(MONTHS[month - 1]), 36, y), item(String(day), 50.4, y));
      items.push(...words(desc, 65.4, y));
      if (ref) items.push(item(ref, 201.6, y));
      if (details) items.push(...words(details, 223.2, y));
      if (debit) items.push(item(peso(debit), 0, y, { right: RIGHT.debit }));
      if (credit) items.push(item(peso(credit), 0, y, { right: RIGHT.credit }));
      items.push(item(peso(balance), 0, y, { right: RIGHT.balance }));
      y = Math.round((y + ROW) * 10) / 10;
    }
    if (t === tablePages - 1) {
      y += 15.6;
      items.push(
        ...words("BALANCE THIS STATEMENT", 65.4, y),
        item(peso(closing), 0, y, { right: RIGHT.balance, h: 5.4 }),
        ...words("TOTAL DEBIT", 65.4, y + 16.5),
        item(peso(totalDebit), 0, y + 16.5, { right: RIGHT.debit }),
        ...words("TOTAL CREDIT", 65.4, y + 24.3),
        item(peso(totalCredit), 0, y + 24.3, { right: RIGHT.credit }),
        ...words("# OF CHECKS", 65.4, y + 32.4),
      );
    }
    pages.push({ pageNumber: n, width: 612, height: 792, items });
    pages.push({ pageNumber: n + 1, width: 612, height: 792, items: [] });
  }
  return pages;
}

/** The FAKE sample shown by "Try a sample statement" on the BPI page (one payroll quarter). */
export function sampleBpiStatementPages() {
  const P = (pesos) => Math.round(pesos * 100);
  const transfer = "InstaPay Transfer";
  const toBank = "TRANSFER TO OTHER BANK";
  const fee = "InstaPay Transfer Fee";
  return bpiStatementPages({
    period: { start: { y: 2026, m: 5, d: 13 }, end: { y: 2026, m: 8, d: 13 } },
    opening: P(8450.25),
    rows: [
      [5, 15, "Bizlink Payroll", "101", "BIZLINK", 0, P(28500)],
      [5, 16, transfer, "", toBank, P(5000), 0],
      [5, 16, fee, "", toBank, P(25), 0],
      [5, 18, "Purchase-MC @SAMPLE STORE", "214", "", P(1249.5), 0],
      [5, 22, "ATM Withdrawal-BPI@SAMPLE MALL", "305", "", P(3000), 0],
      [5, 30, "Bizlink Payroll", "101", "BIZLINK", 0, P(28500)],
      [6, 1, transfer, "", toBank, P(12000), 0],
      [6, 1, fee, "", toBank, P(25), 0],
      [6, 5, "Purchase-MC @SAMPLE ONLINE", "214", "", P(899), 0],
      [6, 15, "Bizlink Payroll", "101", "BIZLINK", 0, P(28500)],
      [6, 16, transfer, "", toBank, P(15000), 0],
      [6, 16, fee, "", toBank, P(25), 0],
      [6, 30, "INTEREST EARNED", "", "", 0, P(6.4)],
      [6, 30, "TAX WITHHELD", "", "", P(1.28), 0],
      [7, 2, "1234 ELINK PAYMENT", "412", "REMITTANCE", 0, P(4500)],
      [7, 10, "ATM Withdrawal-BPI@SAMPLE MALL", "305", "", P(5000), 0],
      [7, 15, "Bizlink Payroll", "101", "BIZLINK", 0, P(28500)],
      [7, 16, transfer, "", toBank, P(20000), 0],
      [7, 16, fee, "", toBank, P(25), 0],
      [7, 24, "Purchase-MC @SAMPLE STORE", "214", "", P(2310.75), 0],
      [8, 1, transfer, "", toBank, P(18000), 0],
      [8, 1, fee, "", toBank, P(25), 0],
    ],
  });
}
