import { groupRows } from "../pdf/pageText.ts";
import { parseDateTime } from "../lib/dates.ts";
import { formatMoney, parseMoney } from "../lib/money.ts";
import type { PageText, ParseResult, StatementParser, TextItem, Transaction } from "./types.ts";

/*
 * GCash "Transaction History" layout (observed):
 *   Title "GCash Transaction History", then "YYYY-MM-DD to YYYY-MM-DD".
 *   Header row: Date and Time | Description | Reference No. | Debit | Credit | Balance
 *     (repeated at the top of every page).
 *   "STARTING BALANCE" row first, "ENDING BALANCE", "Total Debit", "Total Credit" rows last.
 *   Amounts are right-aligned with no thousands separator; dates are "YYYY-MM-DD hh:mm AM".
 *   Long descriptions wrap and are vertically centred on the row, so wrapped lines sit
 *   ABOVE and BELOW the line holding the date/reference/amounts, and the date can be a few
 *   points off. So we anchor each transaction on its reference number and attach every
 *   nearby item to the closest anchor, instead of relying on y-row grouping alone.
 */

const HEADER_LABELS = {
  date: "Date and Time",
  description: "Description",
  ref: "Reference No.",
  debit: "Debit",
  credit: "Credit",
  balance: "Balance",
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?)?$/i;
const REF_RE = /^\d{6,}$/;
const PERIOD_RE = /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/i;
const TITLE_RE = /^GCash Transaction History$/i;

type SummaryKey = "opening" | "closing" | "totalDebit" | "totalCredit";
const SUMMARY_LABELS: [RegExp, SummaryKey][] = [
  [/^STARTING BALANCE$/i, "opening"],
  [/^ENDING BALANCE$/i, "closing"],
  [/^Total Debit$/i, "totalDebit"],
  [/^Total Credit$/i, "totalCredit"],
];

type AmountColumn = "debit" | "credit" | "balance";

interface Layout {
  headerY: number;
  dateX: number;
  refX: number;
  /** items starting at or right of this x are in the amount columns */
  amountsLeft: number;
  /** right edges of the amount header labels (amounts are right-aligned under them) */
  right: Record<AmountColumn, number>;
}

/** Max vertical distance (pt) from a reference-number anchor for an item to belong to it. */
const MAX_ANCHOR_DISTANCE = 9;

function findLayout(page: PageText): Layout | null {
  for (const row of groupRows(page.items)) {
    const find = (label: string) => row.items.find((i) => i.str.trim() === label);
    const date = find(HEADER_LABELS.date);
    const desc = find(HEADER_LABELS.description);
    const ref = find(HEADER_LABELS.ref);
    const debit = find(HEADER_LABELS.debit);
    const credit = find(HEADER_LABELS.credit);
    const balance = find(HEADER_LABELS.balance);
    if (!date || !desc || !ref || !debit || !credit || !balance) continue;
    return {
      headerY: row.y,
      dateX: date.x,
      refX: ref.x,
      amountsLeft: (ref.x + ref.width + debit.x) / 2,
      right: {
        debit: debit.x + debit.width,
        credit: credit.x + credit.width,
        balance: balance.x + balance.width,
      },
    };
  }
  return null;
}

type Kind = "date" | "ref" | "amount" | "description" | "unknown";

function classify(item: TextItem, layout: Layout): Kind {
  const s = item.str.trim();
  if (item.x >= layout.amountsLeft) return parseMoney(s) !== null ? "amount" : "unknown";
  if (REF_RE.test(s) && item.x >= layout.refX - 30) return "ref";
  if (DATE_RE.test(s) && item.x < layout.dateX + 20) return "date";
  return "description";
}

function amountColumn(item: TextItem, layout: Layout): AmountColumn {
  const right = item.x + item.width;
  const cols: AmountColumn[] = ["debit", "credit", "balance"];
  let best: AmountColumn = "balance";
  let bestDist = Infinity;
  for (const col of cols) {
    const dist = Math.abs(layout.right[col] - right);
    if (dist < bestDist) {
      best = col;
      bestDist = dist;
    }
  }
  return best;
}

function describe(items: TextItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.str.trim())
    .join(" | ");
}

/** Join wrapped description lines; a line ending in "-" continues the same token. */
function joinDescription(items: TextItem[]): string {
  const lines = groupRows(items, 1).map((r) =>
    r.items
      .map((i) => i.str.trim())
      .join(" ")
      .trim(),
  );
  let out = "";
  for (const line of lines) {
    if (!line) continue;
    out = !out ? line : out.endsWith("-") ? out + line : `${out} ${line}`;
  }
  return out.replace(/\s+/g, " ");
}

function buildTransaction(anchor: TextItem, members: TextItem[], layout: Layout): Transaction {
  const flags: string[] = [];
  const all = [anchor, ...members];
  const byKind = (k: Kind) => all.filter((i) => classify(i, layout) === k);

  const refs = byKind("ref");
  const dates = byKind("date");
  const amounts: Record<AmountColumn, number[]> = { debit: [], credit: [], balance: [] };
  for (const item of byKind("amount")) {
    amounts[amountColumn(item, layout)].push(parseMoney(item.str) ?? 0);
  }

  let date = "";
  let time: string | undefined;
  if (dates.length !== 1) flags.push(dates.length ? "multiple dates" : "missing date");
  const parsed = dates[0] ? parseDateTime(dates[0].str) : null;
  if (parsed) {
    date = parsed.date;
    time = parsed.time;
  } else if (dates[0]) {
    flags.push(`unreadable date "${dates[0].str.trim()}"`);
  }

  if (refs.length > 1) flags.push("multiple reference numbers");
  for (const col of ["debit", "credit", "balance"] as const) {
    if (amounts[col].length > 1) flags.push(`multiple ${col} amounts`);
  }
  const debit = amounts.debit[0] ?? 0;
  const credit = amounts.credit[0] ?? 0;
  const balance = amounts.balance[0];
  if (debit < 0 || credit < 0) flags.push("negative amount");
  if (debit && credit) flags.push("both debit and credit");
  if (!debit && !credit) flags.push("no debit or credit amount");
  if (balance === undefined) flags.push("missing balance");

  const description = joinDescription(byKind("description"));
  if (!description) flags.push("missing description");

  const tx: Transaction = {
    date,
    description,
    referenceNo: refs[0]?.str.trim(),
    debit: Math.abs(debit),
    credit: Math.abs(credit),
    raw: describe(all),
  };
  if (time) tx.time = time;
  if (balance !== undefined) tx.balance = balance;
  if (byKind("unknown").length) flags.push("unrecognised text in amount columns");
  if (flags.length) tx.flags = flags;
  return tx;
}

function parse(pages: PageText[]): ParseResult {
  const result: ParseResult = {
    source: "gcash",
    transactions: [],
    warnings: [],
    checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
  };
  const summary: Partial<Record<SummaryKey, number>> = {};
  let layout: Layout | null = null;

  for (const page of pages) {
    const pageLayout = findLayout(page);
    if (pageLayout) layout = pageLayout;
    const headerY = pageLayout?.headerY ?? -Infinity;

    // Above the header: title and statement period.
    for (const item of page.items) {
      if (item.y >= headerY) continue;
      const m = PERIOD_RE.exec(item.str.trim());
      if (m) {
        result.periodStart = parseDateTime(m[1] ?? "")?.date;
        result.periodEnd = parseDateTime(m[2] ?? "")?.date;
      }
    }
    if (!layout) {
      if (page.items.some((i) => !TITLE_RE.test(i.str.trim()) && !PERIOD_RE.test(i.str.trim()))) {
        result.warnings.push(`Page ${page.pageNumber}: no transaction table header found.`);
      }
      continue;
    }
    const current: Layout = layout;
    const body = page.items.filter((i) => i.y > headerY + 1);

    // Summary rows (starting/ending balance, totals).
    const consumed = new Set<TextItem>();
    for (const row of groupRows(body)) {
      for (const [re, key] of SUMMARY_LABELS) {
        if (!row.items.some((i) => re.test(i.str.trim()))) continue;
        const amount = row.items.find(
          (i) => i.x >= current.amountsLeft && parseMoney(i.str) !== null,
        );
        if (amount) summary[key] = parseMoney(amount.str) ?? undefined;
        else result.warnings.push(`Page ${page.pageNumber}: "${re.source}" row has no amount.`);
        row.items.forEach((i) => consumed.add(i));
      }
    }

    const rest = body.filter((i) => !consumed.has(i));
    const anchors = rest.filter((i) => classify(i, current) === "ref");
    // Transactions without a reference number: anchor on a date with no reference nearby.
    for (const d of rest.filter((i) => classify(i, current) === "date")) {
      if (!anchors.some((a) => Math.abs(a.y - d.y) <= MAX_ANCHOR_DISTANCE / 2)) anchors.push(d);
    }
    anchors.sort((a, b) => a.y - b.y);

    const members = new Map<TextItem, TextItem[]>(anchors.map((a) => [a, []]));
    for (const item of rest) {
      if (members.has(item)) continue;
      let best: TextItem | undefined;
      let bestDist = Infinity;
      for (const a of anchors) {
        const dist = Math.abs(a.y - item.y);
        if (dist < bestDist) {
          best = a;
          bestDist = dist;
        }
      }
      if (best && bestDist <= MAX_ANCHOR_DISTANCE) members.get(best)?.push(item);
      else
        result.warnings.push(`Page ${page.pageNumber}: couldn't place text "${item.str.trim()}".`);
    }

    for (const anchor of anchors) {
      result.transactions.push(buildTransaction(anchor, members.get(anchor) ?? [], current));
    }
  }

  result.openingBalance = summary.opening;
  result.closingBalance = summary.closing;
  reconcile(result, summary);
  return result;
}

function reconcile(result: ParseResult, summary: Partial<Record<SummaryKey, number>>): void {
  const { transactions: txs, warnings, checks } = result;

  if (summary.opening === undefined) warnings.push("Starting balance not found.");
  if (summary.closing === undefined) warnings.push("Ending balance not found.");
  if (!txs.length) warnings.push("No transactions found.");

  // Running balance: previous balance + credit − debit must equal this row's balance.
  // We never "fix" the statement's figures; we only describe the gap on the row.
  let prev = summary.opening;
  let compared = 0;
  let mismatched = 0;
  for (const tx of txs) {
    if (tx.balance === undefined) {
      prev = undefined;
      continue;
    }
    if (prev !== undefined) {
      const difference = tx.balance - (prev + tx.credit - tx.debit);
      compared++;
      if (difference !== 0) {
        mismatched++;
        tx.balanceIssue = { kind: tx.balance === prev ? "unchanged" : "different", difference };
      }
    }
    prev = tx.balance;
  }
  if (compared) checks.runningBalanceOk = mismatched === 0;

  const totalDebit = txs.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txs.reduce((s, t) => s + t.credit, 0);
  if (summary.totalDebit !== undefined || summary.totalCredit !== undefined) {
    checks.totalsMatchStatement =
      (summary.totalDebit === undefined || summary.totalDebit === totalDebit) &&
      (summary.totalCredit === undefined || summary.totalCredit === totalCredit);
  }
  if (summary.totalDebit !== undefined && summary.totalDebit !== totalDebit) {
    warnings.push(
      `Total debit mismatch: statement says ${formatMoney(summary.totalDebit)}, rows add up to ${formatMoney(totalDebit)}.`,
    );
  }
  if (summary.totalCredit !== undefined && summary.totalCredit !== totalCredit) {
    warnings.push(
      `Total credit mismatch: statement says ${formatMoney(summary.totalCredit)}, rows add up to ${formatMoney(totalCredit)}.`,
    );
  }
  if (summary.opening !== undefined && summary.closing !== undefined) {
    const expected = summary.opening + totalCredit - totalDebit;
    // Reported via `checks` (the UI shows the difference); not repeated as a warning.
    checks.openingToClosingOk = expected === summary.closing;
  }
  const last = txs[txs.length - 1];
  if (
    last?.balance !== undefined &&
    summary.closing !== undefined &&
    last.balance !== summary.closing
  ) {
    warnings.push(
      `Last row balance ${formatMoney(last.balance)} doesn't match ending balance ${formatMoney(summary.closing)}.`,
    );
  }
}

export const gcashParser: StatementParser = {
  id: "gcash",
  label: "GCash Transaction History",
  canParse: (pages) => pages.some((p) => findLayout(p) !== null),
  parse,
};
