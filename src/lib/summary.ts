import type { ParseResult, Transaction } from "../parsers/types.ts";

export interface MonthTotals {
  /** "YYYY-MM" */
  month: string;
  moneyIn: number;
  moneyOut: number;
  count: number;
}

export interface CategoryTotals {
  category: string;
  moneyIn: number;
  moneyOut: number;
  count: number;
}

export interface Summary {
  count: number;
  countIn: number;
  countOut: number;
  /** centavos */
  moneyIn: number;
  moneyOut: number;
  net: number;
  months: MonthTotals[];
  /** Per category, biggest money out first (then money in). Empty when rows aren't categorized. */
  categories: CategoryTotals[];
  /** rows the parser couldn't read confidently */
  rowsWithReadProblems: number;
  balanceUnchanged: number;
  balanceDifferent: number;
}

export function summarize(result: ParseResult): Summary {
  const txs = result.transactions;
  const byMonth = new Map<string, MonthTotals>();
  const byCategory = new Map<string, CategoryTotals>();
  let moneyIn = 0;
  let moneyOut = 0;
  for (const t of txs) {
    moneyIn += t.credit;
    moneyOut += t.debit;
    if (t.category) {
      const c = byCategory.get(t.category) ?? {
        category: t.category,
        moneyIn: 0,
        moneyOut: 0,
        count: 0,
      };
      c.moneyIn += t.credit;
      c.moneyOut += t.debit;
      c.count++;
      byCategory.set(t.category, c);
    }
    const month = t.date.slice(0, 7);
    if (!month) continue;
    const m = byMonth.get(month) ?? { month, moneyIn: 0, moneyOut: 0, count: 0 };
    m.moneyIn += t.credit;
    m.moneyOut += t.debit;
    m.count++;
    byMonth.set(month, m);
  }
  return {
    count: txs.length,
    countIn: txs.filter((t) => t.credit > 0).length,
    countOut: txs.filter((t) => t.debit > 0).length,
    moneyIn,
    moneyOut,
    net: moneyIn - moneyOut,
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    categories: [...byCategory.values()].sort(
      (a, b) => b.moneyOut - a.moneyOut || b.moneyIn - a.moneyIn,
    ),
    rowsWithReadProblems: txs.filter((t) => t.flags?.length).length,
    balanceUnchanged: txs.filter((t) => t.balanceIssue?.kind === "unchanged").length,
    balanceDifferent: txs.filter((t) => t.balanceIssue?.kind === "different").length,
  };
}

/** Short, human text for the "Balance check" column. */
export function balanceCheckLabel(t: Transaction, format: (c: number) => string): string {
  if (t.balance === undefined) return "No balance shown";
  if (!t.balanceIssue) return "OK";
  return t.balanceIssue.kind === "unchanged"
    ? "Balance didn't change"
    : `Off by ${format(t.balanceIssue.difference)}`;
}

/** Notes column: read problems, if any. */
export function notesLabel(t: Transaction): string {
  return (t.flags ?? []).join("; ");
}

/** e.g. "gcash-statement_2026-03-01_to_2026-03-31" */
export function exportBaseName(result: ParseResult): string {
  const range =
    result.periodStart && result.periodEnd ? `_${result.periodStart}_to_${result.periodEnd}` : "";
  return `${result.source}-statement${range}`;
}
