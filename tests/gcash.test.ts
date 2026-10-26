import { describe, expect, it } from "vitest";
import { gcashParser } from "../src/parsers/gcash.ts";
import { detectParser } from "../src/parsers/index.ts";
import type { PageText, TextItem } from "../src/parsers/types.ts";
import fixture from "./fixtures/gcash-basic.json";

// Synthetic data that mirrors the real GCash layout (see tests/fixtures/gcash-basic.json).
const load = (): PageText[] => structuredClone(fixture.pages) as PageText[];

function findItem(pages: PageText[], str: string): TextItem {
  for (const p of pages) {
    const hit = p.items.find((i) => i.str === str);
    if (hit) return hit;
  }
  throw new Error(`fixture item not found: ${str}`);
}

describe("GCash parser: clean statement", () => {
  const result = gcashParser.parse(load());

  it("is detected by the registry", () => {
    expect(detectParser(load())?.id).toBe("gcash");
  });

  it("reads period, opening and closing balances", () => {
    expect(result.periodStart).toBe("2026-03-01");
    expect(result.periodEnd).toBe("2026-03-31");
    expect(result.openingBalance).toBe(150000);
    expect(result.closingBalance).toBe(1102150);
    expect(result.statementTotals).toEqual({ debit: 298350, credit: 1250500 });
  });

  it("extracts every transaction across pages, in order, without header rows", () => {
    expect(result.transactions).toHaveLength(9);
    expect(result.transactions.map((t) => t.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-10",
      "2026-03-15",
      "2026-03-20",
      "2026-03-31",
    ]);
  });

  it("parses a simple debit row", () => {
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-01",
      time: "08:15",
      description: "Payment to Sample Coffee Shop",
      referenceNo: "1000000000001",
      debit: 15000,
      credit: 0,
      balance: 135000,
    });
    expect(result.transactions[0]?.flags).toBeUndefined();
  });

  it("joins a description wrapped above and below the amounts line", () => {
    expect(result.transactions[1]).toMatchObject({
      time: "13:30",
      description:
        "Received GCash from Sample Bank with account ending in 1234 and invno:20260302SMPLPHM1XXXB000000000000001",
      credit: 250000,
      debit: 0,
    });
  });

  it("joins a hyphen-broken ID without a space", () => {
    expect(result.transactions[5]?.description).toBe(
      "Payment to Sample Food, Merchant Transaction Number: sub-AbCd1234EfGh",
    );
    expect(result.transactions[6]?.description).toBe(
      "Payment to Sample Loans Repayment, Merchant Transaction Number: XyZ987654321",
    );
  });

  it("keeps a date that sits a few points off its row with that row", () => {
    expect(result.transactions[4]).toMatchObject({ date: "2026-03-05", debit: 8550 });
    expect(result.transactions[7]).toMatchObject({ date: "2026-03-20", debit: 14900 });
  });

  it("reads 5-digit amounts and the 12:xx PM edge case", () => {
    expect(result.transactions[8]).toMatchObject({ credit: 1000000, balance: 1102150 });
    expect(result.transactions[4]?.time).toBe("12:00");
  });

  it("passes all reconciliation checks with no warnings", () => {
    expect(result.warnings).toEqual([]);
    expect(result.checks).toEqual({
      totalsMatchStatement: true,
      runningBalanceOk: true,
      openingToClosingOk: true,
    });
  });
});

describe("GCash parser: problems are flagged, not guessed", () => {
  it("flags a payment that didn't change the running balance", () => {
    // Real statements sometimes list a payment while the balance stays the same.
    const pages = load();
    findItem(pages, "2769.50").str = "2855.00";
    const r = gcashParser.parse(pages);
    expect(r.transactions[4]).toMatchObject({
      debit: 8550,
      balance: 285500, // kept exactly as printed
      balanceIssue: { kind: "unchanged", difference: 8550 },
    });
    expect(r.transactions[4]?.flags).toBeUndefined();
    expect(r.checks.runningBalanceOk).toBe(false);
    expect(r.checks.totalsMatchStatement).toBe(true);
    // the next row now moves by a different amount than its own transaction
    expect(r.transactions[5]?.balanceIssue).toEqual({ kind: "different", difference: -8550 });
  });

  it("does not report balance issues on a clean statement", () => {
    expect(gcashParser.parse(load()).transactions.some((t) => t.balanceIssue)).toBe(false);
  });

  it("warns when parsed totals don't match the statement totals", () => {
    const pages = load();
    findItem(pages, "Total Debit"); // sanity
    findItem(pages, "2983.50").str = "2983.00";
    const r = gcashParser.parse(pages);
    expect(r.checks.totalsMatchStatement).toBe(false);
    expect(r.warnings.join("\n")).toMatch(/Total debit mismatch/);
  });

  it("warns when opening + credits − debits ≠ closing", () => {
    const pages = load();
    findItem(pages, "1500.00").str = "1600.00";
    const r = gcashParser.parse(pages);
    expect(r.checks.openingToClosingOk).toBe(false);
    expect(r.checks.totalsMatchStatement).toBe(true);
    // the first row's balance no longer follows from the (changed) starting balance
    expect(r.transactions[0]?.balanceIssue).toEqual({ kind: "different", difference: -10000 });
  });

  it("flags a row with an unreadable date", () => {
    const pages = load();
    findItem(pages, "2026-03-03 07:45 PM").str = "2026-02-30 07:45 PM";
    const r = gcashParser.parse(pages);
    expect(r.transactions[2]?.flags).toContain('unreadable date "2026-02-30 07:45 PM"');
  });

  it("flags a row with no reference number but still keeps it", () => {
    const pages = load();
    const page1 = pages[0]!;
    page1.items = page1.items.filter((i) => i.str !== "1000000000003");
    const r = gcashParser.parse(pages);
    expect(r.transactions).toHaveLength(9);
    expect(r.transactions[2]).toMatchObject({ referenceNo: undefined, debit: 100000 });
  });

  it("reports text it can't place", () => {
    const pages = load();
    pages[1]!.items.push({ str: "Stray note", x: 125.7, y: 300, width: 30, height: 6 });
    const r = gcashParser.parse(pages);
    expect(r.warnings).toContain('Page 2: couldn\'t place text "Stray note".');
  });

  it("does not claim unrelated PDFs", () => {
    const pages: PageText[] = [
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        items: [{ str: "Hello", x: 1, y: 1, width: 10, height: 6 }],
      },
    ];
    expect(gcashParser.canParse(pages)).toBe(false);
    expect(detectParser(pages)).toBeNull();
  });
});
