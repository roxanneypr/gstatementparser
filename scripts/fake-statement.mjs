// Builds FAKE GCash-style statements (same layout as the real Transaction History PDF) with any
// number of transactions, for e2e tests and screenshots. Output matches tests/fixtures/*.json.
//   import { buildStatement } from "./fake-statement.mjs"; pagesToPdf(buildStatement({...}))

const W = (s) => {
  let w = 0;
  for (const c of s) {
    w += /[.,:]/.test(c)
      ? 1.48
      : c === " "
        ? 1.67
        : /[il]/.test(c)
          ? 1.33
          : /[mwMW]/.test(c)
            ? 4.5
            : 3;
  }
  return Math.round(w * 100) / 100;
};
const R = { debit: 440.97, credit: 492.23, balance: 543.89 };
const PITCH = 10.8;
const BOTTOM = 805;

const item = (str, x, y, height = 6, fontName = "g_d0_f2") => ({
  str,
  x,
  y: Math.round(y * 10) / 10,
  width: W(str),
  height,
  fontName,
});
const right = (str, edge, y) => item(str, Math.round((edge - W(str)) * 10) / 10, y);
const money = (c) => (c / 100).toFixed(2);
const header = (y) => [
  item("Date and Time", 50.1, y, 6, "g_d0_f1"),
  item("Description", 211, y, 6, "g_d0_f1"),
  item("Reference No.", 340.9, y, 6, "g_d0_f1"),
  item("Debit", 427, y, 6, "g_d0_f1"),
  item("Credit", 475.6, y, 6, "g_d0_f1"),
  item("Balance", 523.6, y, 6, "g_d0_f1"),
];

/**
 * @param {{ period: [string, string], opening: number, firstRef?: number,
 *   txs: { dt: string, desc: string, debit?: number, credit?: number, balanceOverride?: number | "previous" }[] }} spec
 *   amounts in centavos; `balanceOverride` prints a different balance (to simulate statement gaps)
 *   `firstRef`: reference number of the first row minus one (so overlapping statements can share rows)
 */
export function buildStatement({ period, opening, txs, firstRef = 4000000000000 }) {
  const pages = [];
  let items = [
    item("GCash Transaction History", 183.9, 45.9, 19.21, "g_d0_f1"),
    item(`${period[0]} to ${period[1]}`, 247, 72.3, 9.6),
    ...header(93.3),
  ];
  let y = 93.3 + PITCH;
  const newPage = () => {
    pages.push(items);
    items = header(35.7);
    y = 35.7 + PITCH;
  };
  items.push(item("STARTING BALANCE", 125.7, y), right(money(opening), R.balance, y));
  y += PITCH;

  let balance = opening;
  let ref = firstRef;
  let totalDebit = 0;
  let totalCredit = 0;
  for (let t of txs) {
    if (y > BOTTOM) newPage();
    const previous = balance;
    balance += (t.credit ?? 0) - (t.debit ?? 0);
    if (t.balanceOverride === "previous") t = { ...t, balanceOverride: previous };
    totalDebit += t.debit ?? 0;
    totalCredit += t.credit ?? 0;
    items.push(item(t.dt, 50.1, y), item(t.desc, 125.7, y), item(String(++ref), 329.2, y));
    if (t.debit) items.push(right(money(t.debit), R.debit, y));
    if (t.credit) items.push(right(money(t.credit), R.credit, y));
    items.push(right(money(t.balanceOverride ?? balance), R.balance, y));
    if (t.balanceOverride !== undefined) balance = t.balanceOverride;
    y += PITCH;
  }
  for (const [label, value, edge] of [
    ["ENDING BALANCE", balance, R.balance],
    ["Total Debit", totalDebit, R.debit],
    ["Total Credit", totalCredit, R.credit],
  ]) {
    if (y > BOTTOM) newPage();
    items.push(item(label, 125.7, y), right(money(value), edge, y));
    y += PITCH;
  }
  pages.push(items);
  return pages.map((p, i) => ({ pageNumber: i + 1, width: 595, height: 842, items: p }));
}

/**
 * A deterministic two-month statement (Mar–Apr 2026) with `n` transactions.
 * Rows listed in `unchangedRows` (0-based) print the previous balance, like real statements
 * where a payment is listed but the balance doesn't move.
 * @param {number} [n]
 * @param {{ unchangedRows?: number[] }} [options]
 */
export function twoMonthStatement(n = 45, { unchangedRows = [] } = {}) {
  const payees = [
    "Payment to Sample Coffee Shop",
    "Payment to Sample Ride",
    "Transfer from 09170000000 to 09180000000",
    "Payment to Sample Grocery",
    "Payment to Sample Food, Merchant Transaction Number: abc-1234",
  ];
  /** @type {{ dt: string, desc: string, debit?: number, credit?: number, balanceOverride?: number | "previous" }[]} */
  const txs = [];
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    const day = 1 + Math.floor((i / n) * 61); // spread over Mar 1 – Apr 30
    const month = day <= 31 ? "03" : "04";
    const d = String(day <= 31 ? day : day - 31).padStart(2, "0");
    const hour = String(1 + (i % 12)).padStart(2, "0");
    const dt = `2026-${month}-${d} ${hour}:${String((i * 7) % 60).padStart(2, "0")} ${i % 2 ? "PM" : "AM"}`;
    if (unchangedRows.includes(i)) {
      txs.push({ dt, desc: payees[1], debit: 8500, balanceOverride: "previous" });
    } else if (i % 6 === 0) {
      txs.push({
        dt,
        desc: `Received GCash from Sample Client ${i}`,
        credit: 150000 + Math.floor(rand() * 9) * 10000,
      });
    } else {
      txs.push({
        dt,
        desc: payees[i % payees.length],
        debit: 5000 + Math.floor(rand() * 400) * 100,
      });
    }
  }
  return buildStatement({ period: ["2026-03-01", "2026-04-30"], opening: 500000, txs });
}
