import { describe, expect, it } from "vitest";
import { gcashParser } from "../src/parsers/gcash.ts";
import { detectParser } from "../src/parsers/index.ts";
import { mayaParser } from "../src/parsers/maya.ts";
import type { PageText, TextItem } from "../src/parsers/types.ts";
import fixture from "./fixtures/maya-basic.json";
import gcashFixture from "./fixtures/gcash-basic.json";

// Synthetic data that mirrors the real Maya layout (see tests/fixtures/maya-basic.json).
const load = (): PageText[] => structuredClone(fixture.pages) as PageText[];

function findItem(pages: PageText[], str: string): TextItem {
  for (const p of pages) {
    const hit = p.items.find((i) => i.str === str);
    if (hit) return hit;
  }
  throw new Error(`fixture item not found: ${str}`);
}

describe("Maya parser: clean statement", () => {
  const result = mayaParser.parse(load());

  it("is detected by the registry, and GCash isn't mistaken for Maya", () => {
    expect(detectParser(load())?.id).toBe("maya");
    expect(mayaParser.canParse(gcashFixture.pages as PageText[])).toBe(false);
    expect(gcashParser.canParse(load())).toBe(false);
  });

  it("reads the period and the account summary", () => {
    expect(result.source).toBe("maya");
    expect(result.periodStart).toBe("2026-09-01");
    expect(result.periodEnd).toBe("2026-09-30");
    expect(result.openingBalance).toBe(500000);
    expect(result.closingBalance).toBe(400000);
    expect(result.statementTotals).toEqual({ debit: 350000, credit: 250000 });
  });

  it("does not keep the account holder's name or number", () => {
    expect(result.accountName).toBeUndefined();
    expect(result.accountNumber).toBeUndefined();
    expect(JSON.stringify(result.transactions)).not.toMatch(/JUAN|639170000000/);
  });

  it("extracts every transaction across pages, in order", () => {
    expect(result.transactions.map((t) => [t.date, t.time])).toEqual([
      ["2026-09-01", "08:15"],
      ["2026-09-03", "13:05"],
      ["2026-09-05", "12:30"],
      ["2026-09-10", "21:00"],
      ["2026-09-15", "07:45"],
      ["2026-09-30", "23:59"],
    ]);
    expect(result.transactions.every((t) => !t.flags)).toBe(true);
  });

  it("joins the type and its details, and reads a signed amount as a debit", () => {
    expect(result.transactions[1]).toMatchObject({
      description: "Sent to bank · Instapay Sending",
      referenceNo: "7G8H9J0K1L2M",
      debit: 100000,
      credit: 0,
      balance: 385000,
    });
  });

  it("reads +PHP as money in", () => {
    expect(result.transactions[2]).toMatchObject({ credit: 250000, debit: 0, balance: 635000 });
  });

  it("keeps details split across items and lines", () => {
    expect(result.transactions[3]?.description).toBe(
      "Purchased · SAMPLE STORE *Online Makati,MetroMHPHL Order 12345",
    );
  });

  it("passes all reconciliation checks with no warnings", () => {
    expect(result.checks).toEqual({
      totalsMatchStatement: true,
      runningBalanceOk: true,
      openingToClosingOk: true,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe("Maya parser: problems are flagged, not guessed", () => {
  it("flags a payment that didn't change the running balance", () => {
    const pages = load();
    findItem(pages, "PHP 3,850.00").str = "PHP 4,850.00";
    const r = mayaParser.parse(pages);
    expect(r.transactions[1]?.balanceIssue).toEqual({ kind: "unchanged", difference: 100000 });
    expect(r.checks.runningBalanceOk).toBe(false);
    expect(r.checks.totalsMatchStatement).toBe(true);
  });

  it("warns when parsed totals don't match the account summary", () => {
    const pages = load();
    findItem(pages, "PHP 3,500.00").str = "PHP 3,600.00";
    const r = mayaParser.parse(pages);
    expect(r.checks.totalsMatchStatement).toBe(false);
    expect(r.warnings.some((w) => w.startsWith("Total debit mismatch"))).toBe(true);
  });

  it("flags an unreadable time", () => {
    const pages = load();
    findItem(pages, "08:15:30 AM").str = "25:15:30 AM";
    const r = mayaParser.parse(pages);
    expect(r.transactions[0]?.flags).toContain('unreadable time "25:15:30 AM"');
  });

  it("flags a row with no amount but still keeps it", () => {
    const pages = load();
    pages[0]!.items = pages[0]!.items.filter((i) => i.str !== "-PHP 150.00");
    const r = mayaParser.parse(pages);
    expect(r.transactions).toHaveLength(6);
    expect(r.transactions[0]?.flags).toContain("missing or unreadable amount");
  });

  it("falls back to the table's balance rows when the summary is missing", () => {
    const pages = load();
    pages[0]!.items = pages[0]!.items.filter((i) => !/^(Starting|Ending) balance$/.test(i.str));
    const r = mayaParser.parse(pages);
    expect(r.openingBalance).toBe(500000);
    expect(r.closingBalance).toBe(400000);
    expect(r.checks.openingToClosingOk).toBe(true);
  });

  it("reports text it can't place", () => {
    const pages = load();
    pages[1]!.items.push({ str: "Stray note", x: 108, y: 700, width: 30, height: 8 });
    const r = mayaParser.parse(pages);
    expect(r.warnings).toContain('Page 2: couldn\'t place text "Stray note".');
  });
});
