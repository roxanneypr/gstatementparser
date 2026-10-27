// FAKE BDO "Account Activities" PDFs (positioned text pages, ready for scripts/fake-pdf.mjs). All
// names, numbers, references, merchants and amounts are made up. Descriptions use wording seen on a
// real BDO Account Activities PDF ("Payment via QRPH", "Received from BDO Account", ...); merchant
// and branch names are obviously fake. Layout mirrors the real file (see src/parsers/bdo.ts).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Helvetica advance widths (per 1000 em): scripts/fake-pdf.mjs draws every item in Helvetica at
// its height, so declared widths must match what pdf.js measures.
const HELVETICA = {
  " ": 278,
  ",": 278,
  ".": 278,
  ":": 278,
  "-": 333,
  "/": 278,
  "*": 389,
  "@": 1015,
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
const H = 8;
const W = (s) =>
  Math.round(([...s].reduce((sum, c) => sum + (HELVETICA[c] ?? 556), 0) * H) / 100) / 10;
const item = (str, x, y, { right } = {}) => {
  const width = W(str);
  const left = right !== undefined ? Math.round((right - width) * 10) / 10 : x;
  return { str, x: left, y, width, height: H };
};

/** "2026-10-09" -> "Oct 9, 2026" */
const longDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const peso = (centavos) =>
  `${centavos < 0 ? "-" : ""}PHP ${(Math.abs(centavos) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const AMOUNT_RIGHT = 525;
const ROW = 26.25;
const WRAP = 13.5;

/**
 * @param {object} o
 * @param {[string, string]} o.range ISO start and end of the exported date range
 * @param {number} o.available centavos ("Available balance" when exported)
 * @param {Array<[string, string, string, string, string, number]>} o.rows newest first:
 *   [ISO date, reference, reference line 2, description, description line 2, signed centavos]
 * @param {number} [o.firstPageRows]
 * @param {number} [o.rowsPerPage]
 */
export function bdoAccountActivitiesPages({
  range,
  available,
  rows,
  firstPageRows = 22,
  rowsPerPage = 23,
}) {
  const chunks = [rows.slice(0, firstPageRows)];
  for (let i = firstPageRows; i < rows.length; i += rowsPerPage) {
    chunks.push(rows.slice(i, i + rowsPerPage));
  }
  const pages = [];
  chunks.forEach((chunk, index) => {
    const n = index + 1;
    const items = [];
    let y;
    if (n === 1) {
      items.push(
        item("Exported date range", 450.4, 60.9),
        item("Dear Customer,", 72.6, 67.3),
        item(longDate(range[0]), 474.8, 74.4),
        item(
          "The transactions are listed below for the savings account, Account Number: 0000 0000 0000",
          72.6,
          87.9,
        ),
        item(longDate(range[1]), 475.5, 87.9),
        item("Available balance", 376.9, 122.8),
        item(peso(available), 448.8, 122.8),
        item("Account Number: 0000 0000 0000", 72.6, 126.4),
      );
      y = 160.6;
    } else {
      items.push(
        item("Available balance", 376.1, 84.9),
        item(peso(available), 448.1, 84.9),
        item("Account Number: 0000 0000 0000", 72.8, 88.5),
      );
      y = 150.9;
    }
    items.push(
      item("Date", 78.6, y),
      item("Reference", 143.9, y),
      item("Description", 258.1, y),
      item("Amount", 485.1, y),
    );
    y = Math.round((y + 25.2) * 10) / 10;
    for (const [date, ref, ref2, desc, desc2, amount] of chunk) {
      items.push(item(longDate(date), 76.4, y));
      if (ref) items.push(item(ref, 143.9, y));
      items.push(item(desc, 258.1, y));
      items.push(item(peso(amount), 0, y, { right: AMOUNT_RIGHT }));
      if (ref2) items.push(item(ref2, 143.9, Math.round((y + WRAP) * 10) / 10));
      if (desc2) items.push(item(desc2, 258.1, Math.round((y + WRAP) * 10) / 10));
      y = Math.round((y + ROW) * 10) / 10;
    }
    items.push(item(`Page ${n} of ${chunks.length}`, 273.1, 807.9));
    pages.push({ pageNumber: n, width: 595.3, height: 841.9, items });
  });
  return pages;
}

/** The FAKE sample shown by "Try a sample statement" on the BDO page (newest first). */
export function sampleBdoStatementPages() {
  const P = (pesos) => Math.round(pesos * 100);
  const qr = (n) => `QRPAY2026${String(n).padStart(13, "0")}`;
  const sentTo = (n) => [`PC-BDOPAY1-P-2026100${n}-`, `0000000${n}`];
  return bdoAccountActivitiesPages({
    range: ["2026-08-27", "2026-10-27"],
    available: P(23807.85),
    rows: [
      ["2026-10-26", qr(31), "", "Payment via QRPH", "", -P(185)],
      ["2026-10-25", ...sentTo(1), "Sent to ****1234", "", -P(1500)],
      [
        "2026-10-24",
        "POS W/D SV SAMPLE",
        "",
        "POS W/D SV SAMPLE STORE",
        "SAMPLE CITY POS",
        -P(2349.5),
      ],
      ["2026-10-22", "FT SA-SA DIGIFI POB", "", "Received from BDO Account", "", P(3000)],
      ["2026-10-20", qr(30), "", "Payment via QRPH", "", -P(420)],
      ["2026-10-17", "BN-20261017-00000002", "", "Sent via Instapay GXI", "****5678", -P(2000)],
      ["2026-10-15", "IBTD", "", "Received from Other Bank", "", P(18500)],
      [
        "2026-10-14",
        "W/D FR SAV BDO/000001",
        "",
        "W/D FR SAV BDO/000001",
        "SAMPLE BRANCH BDO",
        -P(5000),
      ],
      ["2026-10-10", qr(29), "", "Payment via QRPH", "", -P(96)],
      [
        "2026-10-08",
        "PMR-BDOPAY1-PROD-",
        "00000003-00000004",
        "Prepaid Reload to ****1234",
        "",
        -P(300),
      ],
      ["2026-10-03", "", "", "IBTW", "", -P(1000)],
      ["2026-09-30", "IBTD", "", "Received from Other Bank", "", P(18500)],
      ["2026-09-30", "INTEREST WITHHELD", "", "INTEREST WITHHELD", "", -P(0.84)],
      ["2026-09-30", "INTEREST PAY SYS-GEN", "", "INTEREST PAY SYS-GEN", "", P(4.2)],
      ["2026-09-26", ...sentTo(5), "Sent to ****1234", "", -P(2500)],
      ["2026-09-21", qr(28), "", "Payment via QRPH", "", -P(1275)],
      ["2026-09-15", "IBTD", "", "Received from Other Bank", "", P(18500)],
      [
        "2026-09-14",
        "W/D FR SAV BDO/000001",
        "",
        "W/D FR SAV BDO/000001",
        "SAMPLE BRANCH BDO",
        -P(4000),
      ],
      ["2026-09-09", "BN-20260909-00000006", "", "Sent via Instapay GXI", "****5678", -P(3500)],
      ["2026-09-07", "FT SA-SA DIGIFI POB", "", "Received from BDO Account", "", P(1200)],
      ["2026-09-05", qr(27), "", "Payment via QRPH", "", -P(642.75)],
      [
        "2026-09-02",
        "POS W/D SV SAMPLE",
        "",
        "POS W/D SV SAMPLE STORE",
        "SAMPLE CITY POS",
        -P(1899),
      ],
      ["2026-08-31", "IBTD", "", "Received from Other Bank", "", P(18500)],
      ["2026-08-30", "SERVICE CHG SYS-GEN", "", "SERVICE CHG SYS-GEN", "", -P(300)],
      ["2026-08-28", ...sentTo(7), "Sent to ****1234", "", -P(1200)],
    ],
  });
}
