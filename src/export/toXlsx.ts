import { CFB, utils, write, type CellObject, type WorkSheet } from "xlsx";
import { formatMoney } from "../lib/money.ts";
import {
  balanceCheckLabel,
  isCombined,
  notesLabel,
  statementsOf,
  summarize,
} from "../lib/summary.ts";
import type { ParseResult, ReconciliationChecks, Workbook } from "../parsers/types.ts";

const SOURCE_NAMES: Record<ParseResult["source"], string> = {
  gcash: "GCash",
  maya: "Maya",
  bpi: "BPI",
  bdo: "BDO",
  generic: "Bank",
  mixed: "Combined",
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
  const combined = isCombined(result);
  const labels = statementsOf(result).map((st) => st.label);
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
      ...(combined ? ["Statement"] : []),
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
      ...(combined ? [text(labels[t.statement ?? 0] ?? "")] : []),
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
    ...(combined ? [{ wch: 34 }] : []),
  ];
  ws["!autofilter"] = {
    ref: utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length - 1, c: combined ? 10 : 9 },
    }),
  };
  return ws;
}

const dateCell = (iso?: string): CellObject =>
  iso ? { t: "n", v: excelDate(iso), z: DATE } : text("");

/** One word per statement for the per-statement table. */
function checkLabel(c: ReconciliationChecks): string {
  const values = [c.totalsMatchStatement, c.runningBalanceOk, c.openingToClosingOk];
  if (values.some((v) => v === false)) return "Needs a look";
  return values.some((v) => v === true) ? "OK" : "Not available";
}

function statementsTable(result: ParseResult): CellObject[][] {
  const wb = result as Workbook;
  return [
    [],
    [text("Statements")],
    [
      "Statement",
      "Period start",
      "Period end",
      "Starting balance",
      "Ending balance",
      "In",
      "Out",
      "Transactions",
      "Duplicates left out",
      "Checks",
    ].map(text),
    ...wb.statements.map(({ label, result: r, duplicates }) => {
      const sum = summarize(r);
      return [
        text(label),
        dateCell(r.periodStart),
        dateCell(r.periodEnd),
        r.openingBalance !== undefined ? peso(r.openingBalance) : text("Not shown"),
        r.closingBalance !== undefined ? peso(r.closingBalance) : text("Not shown"),
        peso(sum.moneyIn),
        peso(sum.moneyOut),
        { t: "n", v: sum.count } as CellObject,
        { t: "n", v: wb.duplicates.removed ? duplicates : 0 } as CellObject,
        text(checkLabel(r.checks)),
      ];
    }),
  ];
}

function summarySheet(result: ParseResult): WorkSheet {
  const s = summarize(result);
  const combined = isCombined(result);
  const wb = result as Workbook;
  const severalAccounts = combined && wb.accounts > 1;
  const money = (c: number | undefined) =>
    c !== undefined ? peso(c) : text(severalAccounts ? "Several accounts" : "Not shown");
  const title = combined
    ? `${SOURCE_NAMES[result.source]} statements summary`
    : `${SOURCE_NAMES[result.source]} statement summary`;
  const rows: CellObject[][] = [
    [text(title)],
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
    ...(combined
      ? [
          [text("Statements"), { t: "n", v: wb.statements.length } as CellObject],
          [
            text(
              wb.duplicates.removed
                ? "Duplicate rows left out (in two overlapping statements)"
                : "Rows in two overlapping statements (kept, counted twice)",
            ),
            { t: "n", v: wb.duplicates.found } as CellObject,
          ],
        ]
      : []),
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
    ...(combined ? statementsTable(result) : []),
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
  ws["!cols"] = [{ wch: 48 }, ...Array.from({ length: 9 }, () => ({ wch: 16 }))];
  return ws;
}

/** Money out per category per month: a ready-made budget table (only when there are 2+ months). */
function spendingSheet(result: ParseResult): WorkSheet | null {
  const months = [
    ...new Set(result.transactions.map((t) => t.date.slice(0, 7)).filter(Boolean)),
  ].sort();
  const categories = summarize(result).categories.filter((c) => c.moneyOut > 0);
  if (months.length < 2 || !categories.length) return null;
  const out = new Map<string, number>();
  for (const t of result.transactions) {
    if (!t.debit || !t.category) continue;
    const key = `${t.category}|${t.date.slice(0, 7)}`;
    out.set(key, (out.get(key) ?? 0) + t.debit);
  }
  const cell = (c: number): CellObject => (c ? peso(c) : empty());
  const rows: CellObject[][] = [
    [
      text("Category"),
      ...months.map((m) => ({ t: "n", v: excelDate(`${m}-01`), z: MONTH }) as CellObject),
      text("Total"),
    ],
    ...categories.map((c) => [
      text(c.category),
      ...months.map((m) => cell(out.get(`${c.category}|${m}`) ?? 0)),
      peso(c.moneyOut),
    ]),
    [
      text("Total"),
      ...months.map((m) =>
        peso(categories.reduce((n, c) => n + (out.get(`${c.category}|${m}`) ?? 0), 0)),
      ),
      peso(categories.reduce((n, c) => n + c.moneyOut, 0)),
    ],
  ];
  const ws = utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, ...months.map(() => ({ wch: 13 })), { wch: 14 }];
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

/** Build the .xlsx bytes: "Transactions" + "Summary" (+ "Spending by month" for 2+ months). */
export function toXlsx(result: ParseResult): Uint8Array {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, transactionsSheet(result), "Transactions");
  utils.book_append_sheet(wb, summarySheet(result), "Summary");
  const spending = spendingSheet(result);
  if (spending) utils.book_append_sheet(wb, spending, "Spending by month");
  const bytes = new Uint8Array(write(wb, { bookType: "xlsx", type: "array", compression: true }));
  return freezeHeaderRow(bytes, "/xl/worksheets/sheet1.xml");
}
