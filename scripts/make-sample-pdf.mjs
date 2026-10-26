// Builds public/sample/sample-gcash-statement.pdf: a FAKE statement in the real GCash
// Transaction History layout, used by the "Try a sample statement" button.
//   node scripts/make-sample-pdf.mjs
// All names, numbers and amounts are made up. Descriptions follow the wording real statements use.
import { mkdirSync, writeFileSync } from "node:fs";
import { pagesToPdf } from "./fake-pdf.mjs";
import { buildStatement } from "./fake-statement.mjs";

const rows = [
  // [date, time, description, debit, credit]  amounts in pesos
  ["2026-03-01", "08:12 AM", "Received GCash from BPI with account ending in 1234", 0, 5000],
  ["2026-03-01", "12:40 PM", "Payment to Angkas", 186, 0],
  ["2026-03-02", "07:55 PM", "Transfer from 09170000001 to 09180000002", 1500, 0],
  ["2026-03-04", "09:10 AM", "Refund from Grab Philippines", 0, 75],
  ["2026-03-05", "06:22 PM", "Payment to Grab Philippines", 249, 0],
  ["2026-03-07", "11:05 AM", "Payment to 7-Eleven", 132.5, 0],
  ["2026-03-08", "03:30 PM", "Transfer from 09190000003 to 09170000001", 0, 2500],
  ["2026-03-10", "08:45 PM", "Payment to Netflix", 549, 0],
  ["2026-03-12", "01:15 PM", "Payment to Angkas", 154, 0],
  ["2026-03-14", "10:00 AM", "Received GCash from MariBank with account ending in 5678", 0, 3000],
  ["2026-03-15", "07:20 PM", "Payment to Angkas", 92, 0, "unchanged"],
  ["2026-03-16", "05:48 PM", "Payment to Foodpanda", 389, 0],
  ["2026-03-18", "09:30 AM", "Transfer from 09170000001 to 09200000004", 1000, 0],
  ["2026-03-20", "12:05 PM", "Payment to DOTR MRT3 QR", 28, 0],
  ["2026-03-20", "06:10 PM", "Refund from DOTR MRT3 QR", 0, 3],
  ["2026-03-22", "02:40 PM", "Payment to Grab Philippines", 312, 0],
  ["2026-03-25", "11:30 AM", "Received GCash from BPI with account ending in 1234", 0, 5000],
  ["2026-03-27", "08:15 PM", "Payment to Shopee", 1299, 0],
  ["2026-03-29", "04:25 PM", "Payment to 7-Eleven", 87, 0],
  ["2026-03-31", "09:00 PM", "Transfer from 09170000001 to 09180000002", 2000, 0],
  ["2026-04-02", "08:05 AM", "Payment to Angkas", 171, 0],
  ["2026-04-03", "12:50 PM", "Payment to Foodpanda", 455, 0],
  ["2026-04-05", "10:10 AM", "Transfer from 09210000005 to 09170000001", 0, 1200],
  ["2026-04-07", "07:35 PM", "Payment to Grab Philippines", 268, 0],
  ["2026-04-09", "03:00 PM", "Payment to Shopee", 640, 0],
  ["2026-04-11", "09:45 AM", "Received GCash from MariBank with account ending in 5678", 0, 3000],
  ["2026-04-13", "06:30 PM", "Payment to Netflix", 549, 0],
  ["2026-04-15", "01:20 PM", "Payment to Angkas", 143, 0],
  ["2026-04-18", "11:55 AM", "Payment to 7-Eleven", 215, 0],
  ["2026-04-21", "08:40 PM", "Transfer from 09170000001 to 09200000004", 1500, 0],
  ["2026-04-24", "05:05 PM", "Payment to Foodpanda", 362, 0],
  ["2026-04-27", "10:25 AM", "Received GCash from BPI with account ending in 1234", 0, 5000],
  ["2026-04-29", "07:15 PM", "Payment to Grab Philippines", 224, 0],
  ["2026-04-30", "09:50 PM", "Payment to Shopee", 899, 0],
];

const centavos = (pesos) => Math.round(pesos * 100);
const pages = buildStatement({
  period: ["2026-03-01", "2026-04-30"],
  opening: centavos(1250),
  txs: rows.map(([date, time, desc, debit, credit, gap]) => ({
    dt: `${date} ${time}`,
    desc,
    debit: centavos(debit),
    credit: centavos(credit),
    ...(gap === "unchanged" ? { balanceOverride: "previous" } : {}),
  })),
});

mkdirSync("public/sample", { recursive: true });
writeFileSync("public/sample/sample-gcash-statement.pdf", pagesToPdf(pages));
console.log("Wrote public/sample/sample-gcash-statement.pdf");
