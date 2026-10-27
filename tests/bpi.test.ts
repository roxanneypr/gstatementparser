import { describe, expect, it } from "vitest";
import { bpiParser, unspace } from "../src/parsers/bpi.ts";
import { gcashParser } from "../src/parsers/gcash.ts";
import { detectParser } from "../src/parsers/index.ts";
import { mayaParser } from "../src/parsers/maya.ts";
import type { PageText, TextItem } from "../src/parsers/types.ts";
import fixture from "./fixtures/bpi-basic.json";
import gcashFixture from "./fixtures/gcash-basic.json";
import mayaFixture from "./fixtures/maya-basic.json";

// Synthetic data that mirrors the real BPI layout (see tests/fixtures/bpi-basic.json).
const load = (): PageText[] => structuredClone(fixture.pages) as PageText[];

/** Find an item by its collapsed text ("InstaPay" matches "I n s t a P a y"). */
function findItems(pages: PageText[], str: string): TextItem[] {
  return pages.flatMap((p) => p.items.filter((i) => unspace(i.str) === str));
}

describe("unspace", () => {
  it("collapses letter-spaced text and leaves normal text alone", () => {
    expect(unspace("D E B I T A M O U N T")).toBe("DEBITAMOUNT");
    expect(unspace("9 , 9 9 9 . 5 0")).toBe("9,999.50");
    expect(unspace("T O :")).toBe("TO:");
    expect(unspace("TRANSFER TO OTHER BANK")).toBe("TRANSFER TO OTHER BANK");
    expect(unspace("T O :  B P I")).toBe("TO: BPI");
  });
});

describe("BPI parser: clean statement", () => {
  const result = bpiParser.parse(load());

  it("is detected by the registry, and isn't mistaken for GCash or Maya", () => {
    expect(detectParser(load())?.id).toBe("bpi");
    expect(bpiParser.canParse(gcashFixture.pages as PageText[])).toBe(false);
    expect(bpiParser.canParse(mayaFixture.pages as PageText[])).toBe(false);
    expect(gcashParser.canParse(load())).toBe(false);
    expect(mayaParser.canParse(load())).toBe(false);
  });

  it("reads the period, the account summary and the totals", () => {
    expect(result.source).toBe("bpi");
    expect(result.periodStart).toBe("2026-05-13");
    expect(result.periodEnd).toBe("2026-08-13");
    expect(result.openingBalance).toBe(500000);
    expect(result.closingBalance).toBe(2174484);
    expect(result.statementTotals).toEqual({ debit: 1126066, credit: 2800550 });
  });

  it("does not keep the account holder's name or number", () => {
    expect(result.accountName).toBeUndefined();
    expect(result.accountNumber).toBeUndefined();
  });

  it("reads every row across both table pages, with the year from the period", () => {
    expect(result.transactions.map((t) => t.date)).toEqual([
      "2026-05-15",
      "2026-05-16",
      "2026-05-16",
      "2026-06-02",
      "2026-06-30",
      "2026-06-30",
      "2026-08-01",
    ]);
    expect(result.transactions.every((t) => !t.flags)).toBe(true);
  });

  it("joins description and details, and decides debit/credit by column", () => {
    const [payroll, transfer, fee, purchase, interest, tax, elink] = result.transactions;
    expect(payroll).toMatchObject({
      description: "Bizlink Payroll · BIZLINK",
      referenceNo: "101",
      debit: 0,
      credit: 2500000,
      balance: 3000000,
    });
    expect(transfer).toMatchObject({
      description: "InstaPay Transfer · TRANSFER TO OTHER BANK",
      debit: 1000000,
      credit: 0,
    });
    expect(transfer?.referenceNo).toBeUndefined();
    expect(fee?.description).toBe("InstaPay Transfer Fee · TRANSFER TO OTHER BANK");
    expect(purchase).toMatchObject({ description: "Purchase-MC @SAMPLE STORE", debit: 123456 });
    expect(interest).toMatchObject({ description: "INTEREST EARNED", credit: 550 });
    expect(tax).toMatchObject({ description: "TAX WITHHELD", debit: 110 });
    expect(elink).toMatchObject({
      description: "1234 ELINK PAYMENT · REMITTANCE",
      referenceNo: "412",
      credit: 300000,
      balance: 2174484,
    });
  });

  it("passes every check with no warnings", () => {
    expect(result.checks).toEqual({
      totalsMatchStatement: true,
      runningBalanceOk: true,
      openingToClosingOk: true,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe("BPI parser: problems are reported, not guessed", () => {
  it("flags a balance that doesn't follow from the previous row", () => {
    const pages = load();
    const [balance] = findItems(pages, "19,975.00"); // after the transfer fee
    if (!balance) throw new Error("fixture item not found");
    balance.str = "1 9 , 9 8 5 . 0 0";
    const result = bpiParser.parse(pages);
    expect(result.checks.runningBalanceOk).toBe(false);
    expect(result.transactions[2]?.balanceIssue).toEqual({ kind: "different", difference: 1000 });
    // The statement's own figures are kept as printed.
    expect(result.transactions[2]?.balance).toBe(1998500);
  });

  it("reports a totals mismatch when a row is missing", () => {
    const pages = load();
    const table = pages[2] as PageText;
    const feeY = findItems(pages, "Fee")[0]?.y;
    table.items = table.items.filter((i) => i.y !== feeY);
    const result = bpiParser.parse(pages);
    expect(result.transactions).toHaveLength(6);
    expect(result.checks.totalsMatchStatement).toBe(false);
    expect(result.warnings.some((w) => w.startsWith("Total debit mismatch"))).toBe(true);
  });

  it("flags a row with two amounts instead of picking one", () => {
    const pages = load();
    const [amount] = findItems(pages, "1,234.56");
    if (!amount) throw new Error("fixture item not found");
    pages.find((p) => p.items.includes(amount))?.items.push({ ...amount, x: amount.x + 70.5 });
    const row = bpiParser.parse(pages).transactions[3];
    expect(row?.flags).toContain("multiple amounts");
    expect(row?.debit).toBe(0);
    expect(row?.credit).toBe(0);
  });

  it("takes each row's year from a period that spans Dec–Mar", () => {
    const pages = load();
    const months: Record<string, string> = { May: "Dec", Jun: "Jan", Aug: "Mar" };
    for (const p of pages)
      for (const i of p.items) {
        const s = unspace(i.str);
        if (months[s]) i.str = months[s];
        else if (s.includes("MAY13,2026-AUG13,2026"))
          i.str = s.replace("MAY13,2026-AUG13,2026", "DEC13,2026-MAR13,2027");
      }
    const result = bpiParser.parse(pages);
    expect(result.periodStart).toBe("2026-12-13");
    expect(result.periodEnd).toBe("2027-03-13");
    expect(result.transactions.map((t) => t.date)).toEqual([
      "2026-12-15",
      "2026-12-16",
      "2026-12-16",
      "2027-01-02",
      "2027-01-30",
      "2027-01-30",
      "2027-03-01",
    ]);
    expect(result.transactions.every((t) => !t.flags)).toBe(true);
  });

  it("flags a date outside the statement period instead of moving it", () => {
    const pages = load();
    const [aug] = findItems(pages, "Aug");
    if (!aug) throw new Error("fixture item not found");
    aug.str = "Sep";
    const row = bpiParser.parse(pages).transactions[6];
    expect(row?.date).toBe("2026-09-01");
    expect(row?.flags).toContain("date outside the statement period");
  });

  it("warns when the period is missing instead of guessing a year", () => {
    const pages = load();
    for (const p of pages) p.items = p.items.filter((i) => !/P E R I O D/.test(i.str));
    const result = bpiParser.parse(pages);
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toContain(
      "Statement period not found, so dates without a year couldn't be read.",
    );
  });
});
