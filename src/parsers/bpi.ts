import { groupRows, type Row } from "../pdf/pageText.ts";
import { parseMoney } from "../lib/money.ts";
import { reconcile, type StatementSummary } from "./reconcile.ts";
import type { PageText, ParseResult, StatementParser, TextItem, Transaction } from "./types.ts";

/*
 * BPI savings/payroll account statement layout (observed):
 *   Text is letter-spaced: pdf.js returns "D E B I T A M O U N T" with a space between every
 *   character (and the gap between words inside one item looks the same). Words in transaction
 *   rows are usually separate items, so we collapse each item ("DEBITAMOUNT", "Purchase-MC") and
 *   join items with a space.
 *   Page 1: account holder, address, and an account summary ("Beginning Balance", "Plus: Total
 *   Credits", "Less: Total Debits", "Ending Balance", each with its amount on the same row) for
 *   "THE PERIOD MAY 13, 2026 - AUG 13, 2026". Back pages can be blank.
 *   Table pages: "PERIOD COVERED MAY 13, 2026 - AUG 13, 2026", then the header
 *   DATE | DESCRIPTION | REF | DETAILS | DEBIT AMOUNT | CREDIT AMOUNT | BALANCE.
 *   A "BEGINNING BALANCE" row comes first; after the last transaction come "BALANCE THIS
 *   STATEMENT", "TOTAL DEBIT", "TOTAL CREDIT" and "# OF CHECKS".
 *   Each transaction is one line: "May 13" (no year), description, an optional REF code,
 *   optional details ("TRANSFER TO OTHER BANK"), the amount in the debit or credit column and the
 *   running balance. Amounts are unsigned and right-aligned, so their column is decided by the
 *   right edge.
 *   Unverified: how a page break inside a long table looks, and whether descriptions ever wrap.
 *   A dateless text-only line right below a transaction is treated as a continuation of its
 *   description; anything else is reported.
 */

/** Collapse letter-spaced text: "D E B I T  A M O U N T" -> "DEBIT AMOUNT", "B P I" -> "BPI". */
export function unspace(s: string): string {
  return s
    .trim()
    .split(/\s{2,}/)
    .map((word) => (/^\S( \S)+$/.test(word) ? word.replace(/ /g, "") : word))
    .join(" ");
}

/** Comparison key for labels: letters, digits and a few symbols, uppercase, no spaces. */
const key = (s: string) => s.replace(/\s+/g, "").toUpperCase();

const HEADER = {
  date: "DATE",
  description: "DESCRIPTION",
  ref: "REF",
  details: "DETAILS",
  debit: "DEBITAMOUNT",
  credit: "CREDITAMOUNT",
  balance: "BALANCE",
} as const;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PERIOD_RE = /([A-Z]{3})(\d{1,2}),(\d{4})-([A-Z]{3})(\d{1,2}),(\d{4})/i;
const ROW_DATE_RE = /^([A-Z][a-z]{2})(\d{1,2})$/;
/** Amounts always have centavos; REF codes ("123") don't. */
const AMOUNT_RE = /^[\d,]+\.\d{2}$/;
const PAGE_COUNTER_RE = /^PAGE\d+OF\d+$/;

type SummaryKey = keyof StatementSummary;
/** Account summary on page 1 (label and amount on the same row). */
const SUMMARY_LABELS: [string, SummaryKey][] = [
  ["BEGINNINGBALANCE", "opening"],
  ["PLUS:TOTALCREDITS", "totalCredit"],
  ["LESS:TOTALDEBITS", "totalDebit"],
  ["ENDINGBALANCE", "closing"],
];
/** Summary rows inside the transaction table. */
const TABLE_LABELS: [string, SummaryKey | null][] = [
  ["BEGINNINGBALANCE", "opening"],
  ["BALANCETHISSTATEMENT", "closing"],
  ["TOTALDEBIT", "totalDebit"],
  ["TOTALCREDIT", "totalCredit"],
  ["#OFCHECKS", null],
];

interface Layout {
  headerY: number;
  /** Text starting left of this is the date. */
  descLeft: number;
  /** REF codes start within [refLeft, detailsLeft). */
  refLeft: number;
  detailsLeft: number;
  /** Amounts are right-aligned: compare an amount's right edge with these boundaries. */
  amountsLeft: number;
  debitCreditSplit: number;
  creditBalanceSplit: number;
}

interface Cell {
  str: string; // collapsed text
  x: number;
  right: number;
  item: TextItem;
}

const cells = (row: Row): Cell[] =>
  row.items
    .map((item) => ({ str: unspace(item.str), x: item.x, right: item.x + item.width, item }))
    .filter((c) => c.str !== "");

const rowKey = (cs: Cell[]) => key(cs.map((c) => c.str).join(""));

function findLayout(page: PageText): Layout | null {
  for (const row of groupRows(page.items)) {
    const cs = cells(row);
    const find = (label: string) => cs.find((c) => key(c.str) === label);
    const date = find(HEADER.date);
    const desc = find(HEADER.description);
    const ref = find(HEADER.ref);
    const details = find(HEADER.details);
    const debit = find(HEADER.debit);
    const credit = find(HEADER.credit);
    const balance = find(HEADER.balance);
    if (!date || !desc || !ref || !details || !debit || !credit || !balance) continue;
    // Column headers are centred over their data, so data starts left of each header.
    return {
      headerY: row.y,
      descLeft: date.right + 4,
      refLeft: ref.x - 6,
      detailsLeft: ref.right + 6,
      amountsLeft: debit.x,
      debitCreditSplit: (debit.right + credit.right) / 2,
      creditBalanceSplit: (credit.right + balance.right) / 2,
    };
  }
  return null;
}

type Column = "date" | "description" | "ref" | "details" | "debit" | "credit" | "balance";

function column(c: Cell, layout: Layout): Column {
  if (AMOUNT_RE.test(c.str) && c.right > layout.amountsLeft) {
    if (c.right < layout.debitCreditSplit) return "debit";
    if (c.right < layout.creditBalanceSplit) return "credit";
    return "balance";
  }
  if (c.x < layout.descLeft) return "date";
  if (c.x < layout.refLeft) return "description";
  if (c.x < layout.detailsLeft) return "ref";
  return "details";
}

interface Period {
  start: string;
  end: string;
  startYear: number;
  startMonth: number;
  endYear: number;
}

function readPeriod(text: string): Period | null {
  const m = PERIOD_RE.exec(text);
  if (!m) return null;
  const [, m1 = "", d1 = "", y1 = "", m2 = "", d2 = "", y2 = ""] = m;
  const start = isoDate(Number(y1), MONTHS.indexOf(m1.toUpperCase()) + 1, Number(d1));
  const end = isoDate(Number(y2), MONTHS.indexOf(m2.toUpperCase()) + 1, Number(d2));
  if (!start || !end) return null;
  return {
    start,
    end,
    startYear: Number(y1),
    startMonth: MONTHS.indexOf(m1.toUpperCase()) + 1,
    endYear: Number(y2),
  };
}

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "May" + "13" -> ISO date, taking the year from the statement period (which can span Dec–Jan). */
function rowDate(text: string, period: Period | null): string | null {
  const m = ROW_DATE_RE.exec(text);
  if (!m || !period) return null;
  const month = MONTHS.indexOf((m[1] ?? "").toUpperCase()) + 1;
  if (!month) return null;
  const year =
    period.startYear === period.endYear || month >= period.startMonth
      ? period.startYear
      : period.endYear;
  return isoDate(year, month, Number(m[2]));
}

const join = (cs: Cell[]) => cs.map((c) => c.str).join(" ");

function buildTransaction(
  date: string,
  dateCells: Cell[],
  cs: Cell[],
  layout: Layout,
  period: Period | null,
): Transaction {
  const flags: string[] = [];
  const by = (col: Column) => cs.filter((c) => !dateCells.includes(c) && column(c, layout) === col);

  const refs = by("ref");
  const debits = by("debit");
  const credits = by("credit");
  const balances = by("balance");
  const extra = by("date");
  if (refs.length > 1) flags.push("multiple reference numbers");
  if (extra.length) flags.push(`unexpected text in the date column "${join(extra)}"`);
  if (debits.length + credits.length === 0) flags.push("no debit or credit amount");
  if (debits.length + credits.length > 1) flags.push("multiple amounts");
  if (balances.length !== 1)
    flags.push(balances.length ? "multiple balance amounts" : "missing balance");
  if (period && (date < period.start || date > period.end))
    flags.push("date outside the statement period");

  const description = [join(by("description")), join(by("details"))].filter(Boolean).join(" · ");
  if (!description) flags.push("missing description");

  const one = (list: Cell[]) => (list.length === 1 ? (parseMoney(list[0]?.str ?? "") ?? 0) : 0);
  const tx: Transaction = {
    date,
    description,
    debit: debits.length + credits.length === 1 ? one(debits) : 0,
    credit: debits.length + credits.length === 1 ? one(credits) : 0,
    raw: cs.map((c) => c.str).join(" | "),
  };
  if (refs[0]) tx.referenceNo = refs[0].str;
  const balance = balances.length === 1 ? parseMoney(balances[0]?.str ?? "") : null;
  if (balance !== null) tx.balance = balance;
  if (flags.length) tx.flags = flags;
  return tx;
}

/** Lines of a wrapped description sit closer than this to the line above. */
const CONTINUATION_GAP = 12;

function parse(pages: PageText[]): ParseResult {
  const result: ParseResult = {
    source: "bpi",
    transactions: [],
    warnings: [],
    checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
  };
  const summary: StatementSummary = {};
  const table: StatementSummary = {};
  let period: Period | null = null;
  let layout: Layout | null = null;

  for (const page of pages) {
    const pageLayout = findLayout(page);
    if (pageLayout) layout = pageLayout;
    const headerY = pageLayout?.headerY ?? (layout ? -Infinity : Infinity);
    let last: { tx: Transaction; y: number } | null = null;

    for (const row of groupRows(page.items)) {
      const cs = cells(row);
      const k = rowKey(cs);
      if (!cs.length || PAGE_COUNTER_RE.test(k)) continue;
      period ??= readPeriod(k);

      if (row.y <= headerY + 1) {
        // Above the table (all of page 1): the account summary.
        const label = SUMMARY_LABELS.find(([l]) => k.startsWith(l));
        if (!label || pageLayout) continue;
        const amount = cs.find((c) => AMOUNT_RE.test(c.str));
        if (amount) summary[label[1]] = parseMoney(amount.str) ?? undefined;
        else result.warnings.push(`Page ${page.pageNumber}: "${join(cs)}" has no amount.`);
        continue;
      }
      const current = layout as Layout;

      const tableLabel = TABLE_LABELS.find(([l]) => k.startsWith(l));
      if (tableLabel) {
        last = null;
        const [, field] = tableLabel;
        if (!field) continue;
        const amount = cs.find((c) => AMOUNT_RE.test(c.str));
        if (amount) table[field] = parseMoney(amount.str) ?? undefined;
        else result.warnings.push(`Page ${page.pageNumber}: "${join(cs)}" row has no amount.`);
        continue;
      }

      const dateCells = cs.filter((c) => column(c, current) === "date").slice(0, 2);
      const date = rowDate(dateCells.map((c) => c.str).join(""), period);
      if (date) {
        const tx = buildTransaction(date, dateCells, cs, current, period);
        result.transactions.push(tx);
        last = { tx, y: row.y };
        continue;
      }

      // A dateless line of text right below a transaction: its description wraps.
      const textOnly = cs.every((c) => {
        const col = column(c, current);
        return col === "description" || col === "details";
      });
      if (last && textOnly && row.y - last.y < CONTINUATION_GAP) {
        last.tx.description = `${last.tx.description} ${join(cs)}`;
        last.tx.raw = `${last.tx.raw ?? ""} | ${join(cs)}`;
        last.y = row.y;
        continue;
      }
      last = null;
      result.warnings.push(`Page ${page.pageNumber}: couldn't place text "${join(cs)}".`);
    }
  }

  if (!layout) result.warnings.push("No transaction table header found.");
  if (period) {
    result.periodStart = period.start;
    result.periodEnd = period.end;
  } else {
    result.warnings.push("Statement period not found, so dates without a year couldn't be read.");
  }

  // The account summary on page 1 is the statement's own record; the table's rows back it up.
  const names: Record<SummaryKey, string> = {
    opening: "beginning balance",
    closing: "ending balance",
    totalDebit: "total debit",
    totalCredit: "total credit",
  };
  for (const field of ["opening", "closing", "totalDebit", "totalCredit"] as const) {
    const fromTable = table[field];
    if (summary[field] === undefined) summary[field] = fromTable;
    else if (fromTable !== undefined && fromTable !== summary[field]) {
      result.warnings.push(`The ${names[field]} in the account summary doesn't match the table.`);
    }
  }

  result.openingBalance = summary.opening;
  result.closingBalance = summary.closing;
  if (summary.totalDebit !== undefined || summary.totalCredit !== undefined) {
    result.statementTotals = { debit: summary.totalDebit, credit: summary.totalCredit };
  }
  reconcile(result, summary);
  return result;
}

export const bpiParser: StatementParser = {
  id: "bpi",
  label: "BPI account statement",
  canParse: (pages) => pages.some((p) => findLayout(p) !== null),
  parse,
};
