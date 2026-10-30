// Pure helpers for the transactions table: filtering, search and pagination.
import type { Transaction } from "../parsers/types.ts";

export type TxFilter = "all" | "in" | "out" | "review";

export interface TxQuery {
  filter: TxFilter;
  /** "YYYY-MM", or "" for all months */
  month: string;
  /** free-text search over description and reference no. */
  search: string;
  /** category name, or "" / undefined for all categories */
  category?: string;
  /** statement index as a string (select values), or "" / undefined for all statements */
  statement?: string;
}

/** A transaction plus its 1-based position in the statement (so rows can be found in the PDF). */
export interface IndexedTx {
  row: number;
  tx: Transaction;
}

export const needsReview = (t: Transaction) => Boolean(t.flags?.length || t.balanceIssue);

export function matches(t: Transaction, q: TxQuery): boolean {
  if (q.filter === "in" && !(t.credit > 0)) return false;
  if (q.filter === "out" && !(t.debit > 0)) return false;
  if (q.filter === "review" && !needsReview(t)) return false;
  if (q.month && !t.date.startsWith(q.month)) return false;
  if (q.category && t.category !== q.category) return false;
  if (q.statement && String(t.statement ?? 0) !== q.statement) return false;
  const needle = q.search.trim().toLowerCase();
  if (needle) {
    const hay = `${t.description} ${t.referenceNo ?? ""}`.toLowerCase();
    if (!needle.split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

export function filterTransactions(txs: Transaction[], q: TxQuery): IndexedTx[] {
  const out: IndexedTx[] = [];
  txs.forEach((tx, i) => {
    if (matches(tx, q)) out.push({ row: i + 1, tx });
  });
  return out;
}

/** Counts for the filter tabs, respecting the month and search but not the filter itself. */
export function filterCounts(txs: Transaction[], q: Omit<TxQuery, "filter">) {
  const count = (filter: TxFilter) => txs.filter((t) => matches(t, { ...q, filter })).length;
  return { all: count("all"), in: count("in"), out: count("out"), review: count("review") };
}

export interface Page<T> {
  items: T[];
  /** 1-based, clamped to [1, pages] */
  page: number;
  pages: number;
  /** 1-based index of the first item shown (0 when empty) */
  from: number;
  /** 1-based index of the last item shown */
  to: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, size: number): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pages,
    from: slice.length ? start + 1 : 0,
    to: start + slice.length,
    total: items.length,
  };
}

/** Page buttons to show, e.g. [1, "…", 4, 5, 6, "…", 10]. */
export function pageButtons(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - (nums[i - 1] ?? n) > 1) out.push("…");
    out.push(n);
  });
  return out;
}
