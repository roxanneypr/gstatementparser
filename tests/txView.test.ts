import { describe, expect, it } from "vitest";
import {
  filterCounts,
  filterTransactions,
  pageButtons,
  paginate,
  type TxQuery,
} from "../src/lib/txView.ts";
import type { Transaction } from "../src/parsers/types.ts";

const tx = (over: Partial<Transaction>): Transaction => ({
  date: "2026-03-01",
  description: "Payment to Shop",
  debit: 0,
  credit: 0,
  ...over,
});

const txs: Transaction[] = [
  tx({ description: "Payment to Coffee", referenceNo: "111", debit: 100 }),
  tx({ description: "Received from Bank", referenceNo: "222", credit: 500 }),
  tx({
    date: "2026-04-02",
    description: "Payment to Ride",
    referenceNo: "333",
    debit: 50,
    balanceIssue: { kind: "unchanged", difference: 50 },
  }),
  tx({ date: "2026-04-03", description: "Refund from Ride", referenceNo: "444", credit: 5 }),
];
const q = (over: Partial<TxQuery>): TxQuery => ({ filter: "all", month: "", search: "", ...over });

describe("filterTransactions", () => {
  it("keeps the statement row number", () => {
    expect(filterTransactions(txs, q({ filter: "in" })).map((r) => r.row)).toEqual([2, 4]);
  });
  it("filters money out, needs review and month", () => {
    expect(filterTransactions(txs, q({ filter: "out" })).map((r) => r.row)).toEqual([1, 3]);
    expect(filterTransactions(txs, q({ filter: "review" })).map((r) => r.row)).toEqual([3]);
    expect(filterTransactions(txs, q({ month: "2026-04" })).map((r) => r.row)).toEqual([3, 4]);
  });
  it("searches description and reference no., all words, case-insensitive", () => {
    expect(filterTransactions(txs, q({ search: "ride PAYMENT" })).map((r) => r.row)).toEqual([3]);
    expect(filterTransactions(txs, q({ search: "444" })).map((r) => r.row)).toEqual([4]);
  });
  it("counts each tab within the month/search", () => {
    expect(filterCounts(txs, { month: "2026-04", search: "" })).toEqual({
      all: 2,
      in: 1,
      out: 1,
      review: 1,
    });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);
  it("pages of 20", () => {
    expect(paginate(items, 1, 20)).toMatchObject({ page: 1, pages: 3, from: 1, to: 20, total: 45 });
    expect(paginate(items, 3, 20)).toMatchObject({ from: 41, to: 45, items: [41, 42, 43, 44, 45] });
  });
  it("clamps out-of-range pages and handles empty lists", () => {
    expect(paginate(items, 99, 20).page).toBe(3);
    expect(paginate([], 1, 20)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
});

describe("pageButtons", () => {
  it("shows every page when there are few", () => {
    expect(pageButtons(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("collapses long ranges with ellipses", () => {
    expect(pageButtons(1, 10)).toEqual([1, 2, 3, 4, "…", 10]);
    expect(pageButtons(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pageButtons(10, 10)).toEqual([1, "…", 7, 8, 9, 10]);
  });
});
