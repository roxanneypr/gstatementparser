import { groupRows } from "../pdf/pageText.ts";
import { parseClockTime, parseDayMonthYear } from "../lib/dates.ts";
import { parseMoney } from "../lib/money.ts";
import { reconcile, type StatementSummary } from "./reconcile.ts";
import type { PageText, ParseResult, StatementParser, TextItem, Transaction } from "./types.ts";

/*
 * Maya Wallet "Statement of Account" layout (observed):
 *   Every page starts with the account holder, "Account number:", "Coverage period:
 *   D Mon YYYY - D Mon YYYY" and a page counter. Page 1 also has an "Account summary": a row of
 *   labels (Starting balance | + Total incoming | - Total outgoing | Ending balance) with the
 *   amounts on the row below.
 *   Table header: Date & Time | Transaction type & details | Reference ID | Amount | Running balance
 *     (repeated on every page). A "Beginning Balance" row comes first, "Ending Balance" last,
 *     then "** Nothing follows **".
 *   Each transaction takes two (or more) lines: line 1 has the date ("9 Sep 2026"), the type
 *   ("Sent to bank", "Purchased"), the reference ID, the signed amount ("-PHP 1,234.56") and the
 *   running balance; the lines below have the time ("10:12:13 PM") and the details (merchant,
 *   channel). So we anchor each transaction on its date and attach the lines below it.
 *   Unverified: how money IN is printed. We accept "+PHP 1.00" and "PHP 1.00" as credits; the
 *   running-balance check catches it if that's ever wrong.
 */

const HEADER_LABELS = {
  date: "Date & Time",
  description: "Transaction type & details",
  ref: "Reference ID",
  amount: "Amount",
  balance: "Running balance",
} as const;

const PERIOD_RE = /^(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})$/;
const FOOTER_RE = /^\*+\s*Nothing follows\s*\*+$/i;
const REF_RE = /^[A-Z0-9]{6,}$/i;

type SummaryKey = keyof StatementSummary;
/** Account summary labels at the top of page 1. */
const SUMMARY_LABELS: [RegExp, SummaryKey][] = [
  [/^Starting balance$/i, "opening"],
  [/^\+\s*Total incoming$/i, "totalCredit"],
  [/^[-–−]\s*Total outgoing$/i, "totalDebit"],
  [/^Ending balance$/i, "closing"],
];
/** Balance rows inside the transaction table. */
const TABLE_BALANCE_LABELS: [RegExp, "opening" | "closing"][] = [
  [/^Beginning Balance$/i, "opening"],
  [/^Ending Balance$/i, "closing"],
];

type Column = "date" | "description" | "ref" | "amount" | "balance";

interface Layout {
  headerY: number;
  /** left edge where each column starts (items are assigned by their x) */
  descLeft: number;
  refLeft: number;
  amountLeft: number;
  balanceLeft: number;
}

/** Lines of one transaction sit within this many points of its date line. */
const SAME_LINE = 4;
const MAX_TRANSACTION_HEIGHT = 45;
/** How far below an account-summary label its amount can be. */
const SUMMARY_VALUE_MAX_BELOW = 60;

function findLayout(page: PageText): Layout | null {
  for (const row of groupRows(page.items)) {
    const find = (label: string) => row.items.find((i) => i.str.trim() === label);
    const date = find(HEADER_LABELS.date);
    const desc = find(HEADER_LABELS.description);
    const ref = find(HEADER_LABELS.ref);
    const amount = find(HEADER_LABELS.amount);
    const balance = find(HEADER_LABELS.balance);
    if (!date || !desc || !ref || !amount || !balance) continue;
    return {
      headerY: row.y,
      descLeft: (date.x + desc.x) / 2,
      refLeft: ref.x - 30,
      amountLeft: (ref.x + amount.x) / 2,
      balanceLeft: (amount.x + balance.x) / 2,
    };
  }
  return null;
}

function column(item: TextItem, layout: Layout): Column {
  if (item.x >= layout.balanceLeft) return "balance";
  if (item.x >= layout.amountLeft) return "amount";
  if (item.x >= layout.refLeft) return "ref";
  if (item.x >= layout.descLeft) return "description";
  return "date";
}

const text = (items: TextItem[]) =>
  groupRows(items, 1)
    .map((r) => r.items.map((i) => i.str.trim()).join(" "))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

function describe(items: TextItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.str.trim())
    .join(" | ");
}

function buildTransaction(anchor: TextItem, members: TextItem[], layout: Layout): Transaction {
  const flags: string[] = [];
  const all = [anchor, ...members];
  const onFirstLine = (i: TextItem) => Math.abs(i.y - anchor.y) <= SAME_LINE;
  const inColumn = (c: Column) => all.filter((i) => column(i, layout) === c);

  const date = parseDayMonthYear(anchor.str) ?? "";
  if (!date) flags.push(`unreadable date "${anchor.str.trim()}"`);

  const times = inColumn("date").filter((i) => i !== anchor);
  const time = times.length === 1 ? parseClockTime(times[0]?.str ?? "") : null;
  if (times.length > 1) flags.push("multiple times");
  else if (times[0] && !time) flags.push(`unreadable time "${times[0].str.trim()}"`);

  // The reference ID is on the first line; anything else in that column is description text.
  const refs = inColumn("ref").filter((i) => onFirstLine(i) && REF_RE.test(i.str.trim()));
  if (refs.length > 1) flags.push("multiple reference numbers");
  if (!refs.length) flags.push("missing reference number");

  const amounts = inColumn("amount").map((i) => parseMoney(i.str));
  const balances = inColumn("balance").map((i) => parseMoney(i.str));
  if (amounts.length !== 1 || amounts[0] === null) {
    flags.push(amounts.length > 1 ? "multiple amounts" : "missing or unreadable amount");
  }
  if (balances.length > 1) flags.push("multiple balance amounts");
  if (balances.some((b) => b === null)) flags.push("unreadable balance");
  const amount = amounts.length === 1 ? (amounts[0] ?? 0) : 0;
  const balance = balances.length === 1 ? balances[0] : null;
  if (amounts.length === 1 && amount === 0) flags.push("no debit or credit amount");
  if (balance === null || balance === undefined) flags.push("missing balance");

  const descItems = [
    ...inColumn("description"),
    ...inColumn("ref").filter((i) => !refs.includes(i)),
  ];
  const type = text(descItems.filter(onFirstLine));
  const details = text(descItems.filter((i) => !onFirstLine(i)));
  const description = [type, details].filter(Boolean).join(" · ");
  if (!description) flags.push("missing description");

  const tx: Transaction = {
    date,
    description,
    referenceNo: refs[0]?.str.trim(),
    debit: amount < 0 ? -amount : 0,
    credit: amount > 0 ? amount : 0,
    raw: describe(all),
  };
  if (time) tx.time = time;
  if (balance !== null && balance !== undefined) tx.balance = balance;
  if (flags.length) tx.flags = flags;
  return tx;
}

function parse(pages: PageText[]): ParseResult {
  const result: ParseResult = {
    source: "maya",
    transactions: [],
    warnings: [],
    checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
  };
  const summary: StatementSummary = {};
  const tableBalances: Partial<Record<"opening" | "closing", number>> = {};
  let layout: Layout | null = null;

  for (const page of pages) {
    const pageLayout = findLayout(page);
    if (pageLayout) layout = pageLayout;
    const headerY = pageLayout?.headerY ?? -Infinity;
    const above = page.items.filter((i) => i.y < headerY);

    // Above the table: coverage period and the account summary (page 1).
    for (const item of above) {
      const m = PERIOD_RE.exec(item.str.trim());
      if (m) {
        result.periodStart = parseDayMonthYear(m[1] ?? "") ?? undefined;
        result.periodEnd = parseDayMonthYear(m[2] ?? "") ?? undefined;
      }
      for (const [re, key] of SUMMARY_LABELS) {
        if (!re.test(item.str.trim())) continue;
        let best: TextItem | undefined;
        for (const v of above) {
          const below = v.y - item.y;
          if (below <= 0 || below > SUMMARY_VALUE_MAX_BELOW || parseMoney(v.str) === null) continue;
          if (!best || Math.abs(v.x - item.x) < Math.abs(best.x - item.x)) best = v;
        }
        if (best) summary[key] = parseMoney(best.str) ?? undefined;
        else result.warnings.push(`Page ${page.pageNumber}: "${item.str.trim()}" has no amount.`);
      }
    }
    if (!pageLayout && !layout) continue;
    const current = (pageLayout ?? layout) as Layout;
    const body = page.items.filter((i) => i.y > headerY + 1);

    // Beginning/Ending Balance rows and the closing footer.
    const consumed = new Set<TextItem>();
    for (const item of body) {
      const s = item.str.trim();
      if (FOOTER_RE.test(s)) consumed.add(item);
      for (const [re, key] of TABLE_BALANCE_LABELS) {
        if (!re.test(s)) continue;
        consumed.add(item);
        const amount = body.find(
          (v) =>
            column(v, current) === "balance" &&
            Math.abs(v.y - item.y) <= SAME_LINE + 2 &&
            parseMoney(v.str) !== null,
        );
        if (amount) {
          consumed.add(amount);
          tableBalances[key] = parseMoney(amount.str) ?? undefined;
        } else {
          result.warnings.push(`Page ${page.pageNumber}: "${s}" row has no amount.`);
        }
      }
    }

    const rest = body.filter((i) => !consumed.has(i));
    const anchors = rest
      .filter((i) => column(i, current) === "date" && parseDayMonthYear(i.str) !== null)
      .sort((a, b) => a.y - b.y);
    const members = new Map<TextItem, TextItem[]>(anchors.map((a) => [a, []]));
    for (const item of rest) {
      if (members.has(item)) continue;
      // The transaction whose date line is the closest one at or above this item.
      let owner: TextItem | undefined;
      for (const a of anchors) if (a.y - SAME_LINE <= item.y) owner = a;
      if (owner && item.y - owner.y <= MAX_TRANSACTION_HEIGHT) members.get(owner)?.push(item);
      else
        result.warnings.push(`Page ${page.pageNumber}: couldn't place text "${item.str.trim()}".`);
    }
    for (const anchor of anchors) {
      result.transactions.push(buildTransaction(anchor, members.get(anchor) ?? [], current));
    }
  }

  if (!layout) result.warnings.push("No transaction table header found.");

  // The account summary is the statement's own record; the table's balance rows back it up.
  for (const key of ["opening", "closing"] as const) {
    const fromTable = tableBalances[key];
    if (summary[key] === undefined) summary[key] = fromTable;
    else if (fromTable !== undefined && fromTable !== summary[key]) {
      result.warnings.push(
        `The ${key === "opening" ? "starting" : "ending"} balance in the account summary doesn't match the table.`,
      );
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

export const mayaParser: StatementParser = {
  id: "maya",
  label: "Maya Wallet Statement of Account",
  canParse: (pages) => pages.some((p) => findLayout(p) !== null),
  parse,
};
