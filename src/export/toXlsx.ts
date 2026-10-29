import { CFB, utils, write, type CellObject, type WorkSheet } from "xlsx";
import { formatMoney } from "../lib/money.ts";
import { balanceCheckLabel, notesLabel, summarize } from "../lib/summary.ts";
import type { ParseResult } from "../parsers/types.ts";

const SOURCE_NAMES: Record<ParseResult["source"], string> = {
  gcash: "GCash",
  maya: "Maya",
  bpi: "BPI",
  bdo: "BDO",
  generic: "Bank",
};

const PESO = '"₱"#,##0.00';
const DATE = "yyyy-mm-dd";
const TIME = "hh:mm";
const MONTH = "mmm yyyy";

/** Excel serial date (1900 system) for an ISO "YYYY-MM-DD" date. */
export function excelDate(iso: string): number {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** Fraction of a day for "HH:mm". */
export function excelTime(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return (h * 60 + m) / 1440;
}

const text = (v: string): CellObject => ({ t: "s", v });
const peso = (centavos: number): CellObject => ({ t: "n", v: centavos / 100, z: PESO });
const empty = (): CellObject => ({ t: "z" });
const yesNo = (v: boolean | null) => (v === null ? "Not available" : v ? "Yes" : "No");

function transactionsSheet(result: ParseResult): WorkSheet {
  const rows: CellObject[][] = [
    [
      "Date",
      "Time",
      "Description",
      "Reference No.",
      "Debit",
      "Credit",
      "Balance",
      "Balance check",
      "Notes",
      "Category", // column J: the blog's SUMIFS examples rely on this position
    ].map(text),
  ];
  for (const t of result.transactions) {
    rows.push([
      t.date ? { t: "n", v: excelDate(t.date), z: DATE } : text(""),
      t.time ? { t: "n", v: excelTime(t.time), z: TIME } : empty(),
      text(t.description),
      text(t.referenceNo ?? ""), // text, so long numbers aren't shown as 1.0E+12
      t.debit ? peso(t.debit) : empty(),
      t.credit ? peso(t.credit) : empty(),
      t.balance !== undefined ? peso(t.balance) : empty(),
      text(balanceCheckLabel(t, formatMoney)),
      text(notesLabel(t)),
      text(t.category ?? ""),
    ]);
  }
  const ws = utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 11 },
    { wch: 7 },
    { wch: 60 },
    { wch: 16 },
    { wch: 13 },
    { wch: 13 },
    { wch: 13 },
    { wch: 22 },
    { wch: 30 },
    { wch: 16 },
  ];
  ws["!autofilter"] = {
    ref: utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 9 } }),
  };
  return ws;
}

function summarySheet(result: ParseResult): WorkSheet {
  const s = summarize(result);
  const money = (c: number | undefined) => (c === undefined ? text("Not shown") : peso(c));
  const rows: CellObject[][] = [
    [text(`${SOURCE_NAMES[result.source]} statement summary`)],
    [],
    [
      text("Period start"),
      result.periodStart ? { t: "n", v: excelDate(result.periodStart), z: DATE } : text(""),
    ],
    [
      text("Period end"),
      result.periodEnd ? { t: "n", v: excelDate(result.periodEnd), z: DATE } : text(""),
    ],
    [text("Starting balance"), money(result.openingBalance)],
    [text("Ending balance"), money(result.closingBalance)],
    [text("Total in (credits)"), peso(s.moneyIn)],
    [text("Total out (debits)"), peso(s.moneyOut)],
    [text("Net"), peso(s.net)],
    [text("Transactions"), { t: "n", v: s.count }],
    ...(result.cleanedUp
      ? [
          [
            text("Removed by clean-up (balance didn't change)"),
            { t: "n", v: result.cleanedUp.removed } as CellObject,
          ],
        ]
      : []),
    [],
    [text("Checks")],
    [text("Totals match the statement"), text(yesNo(result.checks.totalsMatchStatement))],
    [
      text("Every row's balance follows the previous row"),
      text(yesNo(result.checks.runningBalanceOk)),
    ],
    [text("Starting + credits − debits = ending"), text(yesNo(result.checks.openingToClosingOk))],
    [text("Rows where the balance didn't change"), { t: "n", v: s.balanceUnchanged }],
    [text("Rows where the balance moved by a different amount"), { t: "n", v: s.balanceDifferent }],
    [text("Rows with read problems"), { t: "n", v: s.rowsWithReadProblems }],
    [],
    [text("Month"), text("In"), text("Out"), text("Net")],
    ...s.months.map((m) => [
      { t: "n", v: excelDate(`${m.month}-01`), z: MONTH } as CellObject,
      peso(m.moneyIn),
      peso(m.moneyOut),
      peso(m.moneyIn - m.moneyOut),
    ]),
    ...(s.categories.length
      ? [
          [],
          [text("Category"), text("In"), text("Out"), text("Transactions")],
          ...s.categories.map((c) => [
            text(c.category),
            peso(c.moneyIn),
            peso(c.moneyOut),
            { t: "n", v: c.count } as CellObject,
          ]),
        ]
      : []),
  ];
  const ws = utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 48 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  return ws;
}

/**
 * SheetJS Community Edition can't write frozen panes, so add the standard OOXML pane
 * element to the given sheet's XML inside the zip (header row frozen).
 */
function freezeHeaderRow(xlsx: Uint8Array, sheetPath: string): Uint8Array {
  const zip = CFB.read(xlsx, { type: "array" });
  const entry = CFB.find(zip, sheetPath);
  if (!entry?.content) return xlsx;
  const xml = new TextDecoder().decode(entry.content as Uint8Array);
  const frozen = xml.replace(
    /<sheetView ([^>]*?)\/>/,
    '<sheetView $1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>',
  );
  if (frozen === xml) return xlsx;
  CFB.utils.cfb_add(zip, sheetPath, new TextEncoder().encode(frozen));
  return new Uint8Array(CFB.write(zip, { fileType: "zip", type: "array" }) as ArrayLike<number>);
}

/** Build the .xlsx workbook bytes: "Transactions" + "Summary" sheets. */
export function toXlsx(result: ParseResult): Uint8Array {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, transactionsSheet(result), "Transactions");
  utils.book_append_sheet(wb, summarySheet(result), "Summary");
  const bytes = new Uint8Array(write(wb, { bookType: "xlsx", type: "array", compression: true }));
  return freezeHeaderRow(bytes, "/xl/worksheets/sheet1.xml");
}
