import { describe, expect, it } from "vitest";
import { bdoParser } from "../src/parsers/bdo.ts";
import { bpiParser } from "../src/parsers/bpi.ts";
import { gcashParser } from "../src/parsers/gcash.ts";
import { detectParser } from "../src/parsers/index.ts";
import { mayaParser } from "../src/parsers/maya.ts";
import type { PageText, TextItem } from "../src/parsers/types.ts";
import fixture from "./fixtures/bdo-basic.json";
import bpiFixture from "./fixtures/bpi-basic.json";
import gcashFixture from "./fixtures/gcash-basic.json";
import mayaFixture from "./fixtures/maya-basic.json";

// Synthetic data that mirrors the real BDO Account Activities layout (tests/fixtures/bdo-basic.json).
const load = (): PageText[] => structuredClone(fixture.pages) as PageText[];

function findItem(pages: PageText[], str: string): TextItem {
  for (const p of pages) {
    const hit = p.items.find((i) => i.str === str);
    if (hit) return hit;
  }
  throw new Error(`fixture item not found: ${str}`);
}

describe("BDO parser: Account Activities", () => {
  const result = bdoParser.parse(load());

  it("is detected by the registry, and no other parser claims it (or is claimed by it)", () => {
    expect(detectParser(load())?.id).toBe("bdo");
    for (const other of [gcashParser, mayaParser, bpiParser]) {
      expect(other.canParse(load())).toBe(false);
    }
    for (const pages of [gcashFixture.pages, mayaFixture.pages, bpiFixture.pages]) {
      expect(bdoParser.canParse(pages as PageText[])).toBe(false);
    }
  });

  it("reads the exported date range, and doesn't keep the account number", () => {
    expect(result.source).toBe("bdo");
    expect(result.periodStart).toBe("2026-09-01");
    expect(result.periodEnd).toBe("2026-10-31");
    expect(result.accountNumber).toBeUndefined();
  });

  it("returns the rows oldest first, across pages", () => {
    expect(result.transactions.map((t) => t.date)).toEqual([
      "2026-09-05",
      "2026-09-30",
      "2026-10-03",
      "2026-10-14",
      "2026-10-15",
      "2026-10-20",
    ]);
    expect(result.transactions.every((t) => !t.flags)).toBe(true);
  });

  it("reads signed amounts, wrapped references and wrapped descriptions", () => {
    const [qr, interest, ibtw, withdrawal, received, sent] = result.transactions;
    expect(qr).toMatchObject({
      description: "Payment via QRPH",
      referenceNo: "QRPAY20260000000000027",
      debit: 64275,
      credit: 0,
    });
    expect(interest).toMatchObject({ description: "INTEREST PAY SYS-GEN", credit: 420 });
    expect(ibtw).toMatchObject({ description: "IBTW", debit: 100000 });
    expect(ibtw?.referenceNo).toBeUndefined();
    expect(withdrawal?.description).toBe("W/D FR SAV BDO/000001 SAMPLE BRANCH BDO");
    expect(received).toMatchObject({ description: "Received from Other Bank", credit: 1850000 });
    // "PC-BDOPAY1-P-20261020-" + "00000001" on the next line is one reference.
    expect(sent).toMatchObject({
      description: "Sent to ****1234",
      referenceNo: "PC-BDOPAY1-P-20261020-00000001",
      debit: 150000,
    });
    for (const tx of result.transactions) expect(tx.balance).toBeUndefined();
  });

  it("has nothing to reconcile against, and says nothing about missing balances", () => {
    expect(result.checks).toEqual({
      totalsMatchStatement: null,
      runningBalanceOk: null,
      openingToClosingOk: null,
    });
    expect(result.openingBalance).toBeUndefined();
    expect(result.closingBalance).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });
});

describe("BDO parser: problems are reported, not guessed", () => {
  it("flags a row without an amount", () => {
    const pages = load();
    const page = pages[1] as PageText;
    page.items = page.items.filter((i) => i.str !== "PHP 4.20");
    const row = bdoParser.parse(pages).transactions[1];
    expect(row?.flags).toContain("missing or unreadable amount");
    expect(row?.credit).toBe(0);
  });

  it("flags a date outside the exported range", () => {
    const pages = load();
    findItem(pages, "Sep 5, 2026").str = "Aug 5, 2026";
    const row = bdoParser.parse(pages).transactions[0];
    expect(row?.date).toBe("2026-08-05");
    expect(row?.flags).toContain("date outside the exported date range");
  });

  it("warns when rows aren't newest first, instead of reordering them", () => {
    const pages = load();
    findItem(pages, "Oct 15, 2026").str = "Oct 25, 2026";
    const result = bdoParser.parse(pages);
    expect(result.warnings).toContain("Rows aren't in date order. Please compare with your PDF.");
  });

  it("reports text it can't place", () => {
    const pages = load();
    (pages[1] as PageText).items.push({
      str: "Stray note",
      x: 258.1,
      y: 700,
      width: 40,
      height: 8,
    });
    const result = bdoParser.parse(pages);
    expect(result.warnings).toContain('Page 2: couldn\'t place text "Stray note".');
  });
});
