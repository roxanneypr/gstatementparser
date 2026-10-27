import { groupRows } from "../pdf/pageText.ts";
import { parseMonthDayYear } from "../lib/dates.ts";
import { parseMoney } from "../lib/money.ts";
import { reconcile } from "./reconcile.ts";
import type { PageText, ParseResult, StatementParser, TextItem, Transaction } from "./types.ts";

/*
 * BDO "Account Activities" PDF (an export of a savings account's transactions), observed layout:
 *   Page 1 top: "Exported date range" with the start and end dates ("Apr 27, 2026",
 *   "Oct 27, 2026") stacked below it, "Dear Customer,", a sentence with the account number,
 *   "Available balance PHP …" and "Account Number: …". Later pages repeat the last two.
 *   Table header on every page: Date | Reference | Description | Amount. Footer "Page 1 of 6".
 *   Each transaction: line 1 has the date ("Oct 9, 2026"), the reference, the description and a
 *   signed amount ("-PHP 1,234.56" out, "PHP 1,234.56" in); a second line can continue the
 *   reference ("PC-BDOPAY…-" / "12345678") and/or the description ("****1234", a branch or
 *   merchant location).
 *   Rows are newest first; we return them oldest first, like every other statement.
 *   No running balance, opening/closing balance or totals are printed ("Available balance" is the
 *   balance when the file was exported, not at the end of the range), so the reconciliation checks
 *   can't run; only row-level problems are flagged.
 */

const HEADER = ["Date", "Reference", "Description", "Amount"] as const;
const DATE_RANGE_LABEL = "Exported date range";
const PAGE_FOOTER_RE = /^Page \d+ of \d+$/i;
/** Lines of one transaction sit within this many points below its date line. */
const MAX_TRANSACTION_HEIGHT = 20;
/** How far below the "Exported date range" label its dates can be. */
const RANGE_MAX_BELOW = 40;

interface Layout {
  headerY: number;
  refLeft: number;
  descLeft: number;
  /** Amounts are right-aligned under "Amount"; anything money-shaped starting here is one. */
  amountLeft: number;
}

function findLayout(page: PageText): Layout | null {
  for (const row of groupRows(page.items)) {
    const [date, ref, desc, amount] = HEADER.map((label) =>
      row.items.find((i) => i.str.trim() === label),
    );
    if (!date || !ref || !desc || !amount) continue;
    return {
      headerY: row.y,
      refLeft: ref.x - 5,
      descLeft: desc.x - 5,
      amountLeft: amount.x - 60,
    };
  }
  return null;
}

type Column = "date" | "ref" | "description" | "amount";

function column(item: TextItem, layout: Layout): Column {
  if (item.x >= layout.amountLeft && parseMoney(item.str) !== null) return "amount";
  if (item.x >= layout.descLeft) return "description";
  if (item.x >= layout.refLeft) return "ref";
  return "date";
}

/** Join wrapped lines: a reference split after "-" continues without a space. */
function joinLines(lines: string[], glue: (prev: string) => string): string {
  return lines.reduce((acc, line) => (acc ? acc + glue(acc) + line : line), "");
}

function buildTransaction(anchor: TextItem, members: TextItem[], layout: Layout): Transaction {
  const flags: string[] = [];
  const lines = (col: Column) =>
    groupRows(members.filter((i) => column(i, layout) === col)).map((r) =>
      r.items.map((i) => i.str.trim()).join(" "),
    );

  const date = parseMonthDayYear(anchor.str) ?? "";
  const extraDates = members.filter((i) => column(i, layout) === "date");
  if (extraDates.length) flags.push("unexpected text in the date column");

  const amounts = members.filter((i) => column(i, layout) === "amount");
  const amount = amounts.length === 1 ? (parseMoney(amounts[0]?.str ?? "") ?? 0) : 0;
  if (amounts.length > 1) flags.push("multiple amounts");
  else if (!amounts.length) flags.push("missing or unreadable amount");
  else if (amount === 0) flags.push("no debit or credit amount");

  const referenceNo = joinLines(lines("ref"), (prev) => (prev.endsWith("-") ? "" : " "));
  const description = joinLines(lines("description"), () => " ");
  if (!description) flags.push("missing description");

  const tx: Transaction = {
    date,
    description,
    debit: amount < 0 ? -amount : 0,
    credit: amount > 0 ? amount : 0,
    raw: [anchor, ...members]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((i) => i.str.trim())
      .join(" | "),
  };
  if (referenceNo) tx.referenceNo = referenceNo;
  if (flags.length) tx.flags = flags;
  return tx;
}

function parse(pages: PageText[]): ParseResult {
  const result: ParseResult = {
    source: "bdo",
    transactions: [],
    warnings: [],
    checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
  };
  let layout: Layout | null = null;
  const newestFirst: Transaction[] = [];

  for (const page of pages) {
    const pageLayout = findLayout(page);
    if (pageLayout) layout = pageLayout;
    const headerY = pageLayout?.headerY ?? (layout ? -Infinity : Infinity);

    // Above the table: the exported date range (page 1).
    const label = page.items.find((i) => i.str.trim() === DATE_RANGE_LABEL);
    if (label && !result.periodStart) {
      const dates = page.items
        .filter((i) => i.y > label.y && i.y - label.y <= RANGE_MAX_BELOW)
        .filter((i) => Math.abs(i.x - label.x) < 60)
        .sort((a, b) => a.y - b.y)
        .map((i) => parseMonthDayYear(i.str))
        .filter((d): d is string => d !== null);
      if (dates.length === 2) [result.periodStart, result.periodEnd] = dates;
    }
    if (!layout) continue;
    const current = layout;

    const body = page.items.filter((i) => i.y > headerY + 1 && !PAGE_FOOTER_RE.test(i.str.trim()));
    const anchors = body
      .filter((i) => column(i, current) === "date" && parseMonthDayYear(i.str) !== null)
      .sort((a, b) => a.y - b.y);
    const members = new Map<TextItem, TextItem[]>(anchors.map((a) => [a, []]));
    for (const item of body) {
      if (members.has(item)) continue;
      // The transaction whose date line is the closest one at or above this item.
      let owner: TextItem | undefined;
      for (const a of anchors) if (a.y - 2 <= item.y) owner = a;
      if (owner && item.y - owner.y <= MAX_TRANSACTION_HEIGHT) members.get(owner)?.push(item);
      else
        result.warnings.push(`Page ${page.pageNumber}: couldn't place text "${item.str.trim()}".`);
    }
    for (const anchor of anchors) {
      newestFirst.push(buildTransaction(anchor, members.get(anchor) ?? [], current));
    }
  }

  if (!layout) result.warnings.push("No transaction table header found.");
  if (!result.periodStart) result.warnings.push("Exported date range not found.");

  // Printed newest first; oldest first matches every other statement and the monthly summary.
  result.transactions = newestFirst.reverse();
  const dates = result.transactions.map((t) => t.date).filter(Boolean);
  if (dates.some((d, i) => i > 0 && d < (dates[i - 1] ?? ""))) {
    result.warnings.push("Rows aren't in date order. Please compare with your PDF.");
  }
  if (result.periodStart && result.periodEnd) {
    const { periodStart: start, periodEnd: end } = result;
    for (const tx of result.transactions) {
      if (tx.date && (tx.date < start || tx.date > end)) {
        tx.flags = [...(tx.flags ?? []), "date outside the exported date range"];
      }
    }
  }
  reconcile(result, {}, { printsBalances: false });
  return result;
}

export const bdoParser: StatementParser = {
  id: "bdo",
  label: "BDO Account Activities",
  canParse: (pages) => pages.some((p) => findLayout(p) !== null),
  parse,
};
