// Combine several parsed statements into one workbook: rows merged in date order, duplicates from
// overlapping statements of the same account left out (and counted), and gaps or balance breaks
// between consecutive statements reported. Statements' own figures and checks are never changed.
import { formatMoney } from "./money.ts";
import type {
  ParseResult,
  ReconciliationChecks,
  Transaction,
  Workbook,
  WorkbookStatement,
} from "../parsers/types.ts";

export interface StatementInput {
  label: string;
  result: ParseResult;
}

export interface CombineOptions {
  /** Keep rows found in two overlapping statements (default: leave them out and say so). */
  keepDuplicates?: boolean;
}

/** Statements from the same account: same source and, when printed, the same account number. */
export const accountKey = (r: ParseResult) => `${r.source}|${r.accountNumber ?? ""}`;

/** Every printed field must match for two rows to count as the same transaction. */
const rowKey = (t: Transaction) =>
  [
    t.date,
    t.time ?? "",
    t.description,
    t.referenceNo ?? "",
    t.debit,
    t.credit,
    t.balance ?? "",
  ].join("\u0000");

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const prevDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** First and last dates a statement covers: its printed period, else its rows' dates. */
function span(r: ParseResult): { start?: string; end?: string } {
  const dates = r.transactions
    .map((t) => t.date)
    .filter(Boolean)
    .sort();
  return { start: r.periodStart ?? dates[0], end: r.periodEnd ?? dates[dates.length - 1] };
}

/** All non-null values true → true; any false → false; nothing to check → null. */
function all(values: (boolean | null)[]): boolean | null {
  if (values.some((v) => v === false)) return false;
  return values.some((v) => v === true) ? true : null;
}

const peso = (c: number) => `₱${formatMoney(c)}`;

export function combine(inputs: StatementInput[], options: CombineOptions = {}): Workbook {
  // Oldest statement first, so duplicates are dropped from the later, overlapping one.
  const order = inputs
    .map((input, i) => ({ input, i, start: span(input.result).start ?? "" }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.i - b.i)
    .map((x) => x.input);

  const seen = new Map<string, Map<string, number>>();
  const statements: WorkbookStatement[] = [];
  const merged: { tx: Transaction; s: number; row: number; date: string }[] = [];
  let found = 0;

  order.forEach(({ label, result }, s) => {
    const account = accountKey(result);
    const earlier = seen.get(account) ?? new Map<string, number>();
    const here = new Map<string, number>();
    for (const t of result.transactions) here.set(rowKey(t), (here.get(rowKey(t)) ?? 0) + 1);

    // A row is a duplicate only as many times as earlier statements of this account already have it.
    const allowance = new Map<string, number>();
    for (const [key] of here) allowance.set(key, earlier.get(key) ?? 0);
    let duplicates = 0;
    let lastDate = "";
    result.transactions.forEach((t, row) => {
      const key = rowKey(t);
      const left = allowance.get(key) ?? 0;
      if (left > 0) {
        allowance.set(key, left - 1);
        duplicates++;
        if (!options.keepDuplicates) return;
      }
      lastDate = t.date || lastDate;
      merged.push({ tx: { ...t, statement: s }, s, row, date: t.date || lastDate });
    });
    for (const [key, n] of here) earlier.set(key, Math.max(earlier.get(key) ?? 0, n));
    seen.set(account, earlier);
    found += duplicates;
    statements.push({ label, result, duplicates });
  });

  // One statement keeps its printed order; several are merged by date (then time), keeping each
  // statement's own order for rows on the same day.
  if (statements.length > 1) {
    merged.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.tx.time ?? "").localeCompare(b.tx.time ?? "") ||
        a.s - b.s ||
        a.row - b.row,
    );
  }

  const results = statements.map((st) => st.result);
  const sources = new Set(results.map((r) => r.source));
  const accounts = new Set(results.map(accountKey));
  const spans = results.map(span);
  const starts = spans
    .map((x) => x.start)
    .filter((d): d is string => Boolean(d))
    .sort();
  const ends = spans
    .map((x) => x.end)
    .filter((d): d is string => Boolean(d))
    .sort();
  const first = results[0];
  const last = results[results.length - 1];
  const single = results.length === 1 ? first : undefined;
  const oneAccount = accounts.size === 1;

  const warnings: string[] = [];
  if (results.length > 1) {
    results.forEach((r, i) => {
      for (const w of r.warnings) warnings.push(`${statements[i]?.label}: ${w}`);
    });
  } else if (single) {
    warnings.push(...single.warnings);
  }
  warnings.push(...continuityWarnings(statements));
  if (found) {
    warnings.push(
      options.keepDuplicates
        ? `${found} ${found === 1 ? "row appears" : "rows appear"} in two overlapping statements and ${found === 1 ? "is" : "are"} counted twice.`
        : `${found} ${found === 1 ? "row was" : "rows were"} left out because ${found === 1 ? "it's" : "they're"} also in an overlapping statement.`,
    );
  }
  if (accounts.size > 1) {
    warnings.push(
      "These statements are from different accounts. Money you moved between your own accounts shows up in both (out of one, into the other), so it's counted twice in the totals.",
    );
  }

  const checks: ReconciliationChecks = {
    totalsMatchStatement: all(results.map((r) => r.checks.totalsMatchStatement)),
    runningBalanceOk: all(results.map((r) => r.checks.runningBalanceOk)),
    openingToClosingOk: all(results.map((r) => r.checks.openingToClosingOk)),
  };
  const removed = results.reduce((n, r) => n + (r.cleanedUp?.removed ?? 0), 0);

  const workbook: Workbook = {
    source: single?.source ?? (sources.size === 1 ? (first?.source ?? "mixed") : "mixed"),
    transactions: merged.map((m) => m.tx),
    warnings,
    checks,
    statements,
    duplicates: { found, removed: !options.keepDuplicates },
    accounts: accounts.size,
  };
  if (single) {
    // A workbook of one is the statement itself (plus the workbook fields).
    return {
      ...single,
      ...workbook,
      transactions: workbook.transactions,
      warnings,
      checks: single.checks,
    };
  }
  if (starts[0]) workbook.periodStart = starts[0];
  if (ends[ends.length - 1]) workbook.periodEnd = ends[ends.length - 1];
  if (oneAccount) {
    if (first?.accountName) workbook.accountName = first.accountName;
    if (first?.accountNumber) workbook.accountNumber = first.accountNumber;
    if (first?.openingBalance !== undefined) workbook.openingBalance = first.openingBalance;
    if (last?.closingBalance !== undefined) workbook.closingBalance = last.closingBalance;
  }
  if (removed) workbook.cleanedUp = { removed };
  return workbook;
}

/** Same-account statements in date order: report missing dates and balances that don't carry over. */
function continuityWarnings(statements: WorkbookStatement[]): string[] {
  const out: string[] = [];
  const byAccount = new Map<string, WorkbookStatement[]>();
  for (const st of statements) {
    const key = accountKey(st.result);
    byAccount.set(key, [...(byAccount.get(key) ?? []), st]);
  }
  for (const group of byAccount.values()) {
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1] as WorkbookStatement;
      const next = group[i] as WorkbookStatement;
      const a = span(prev.result);
      const b = span(next.result);
      if (!a.end || !b.start) continue;
      if (b.start > nextDay(a.end)) {
        out.push(
          `No statement covers ${nextDay(a.end)} to ${prevDay(b.start)} (between "${prev.label}" and "${next.label}").`,
        );
      } else if (b.start === nextDay(a.end)) {
        const closing = prev.result.closingBalance;
        const opening = next.result.openingBalance;
        if (closing !== undefined && opening !== undefined && closing !== opening) {
          out.push(
            `"${prev.label}" ends with ${peso(closing)} but "${next.label}" starts with ${peso(opening)}.`,
          );
        }
      }
    }
  }
  return out;
}
