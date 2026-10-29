import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleGenericStatementPages, tablePages } from "../scripts/fake-table.mjs";
import { genericParser, parseAmount, parseDateToken } from "../src/parsers/generic.ts";
import { detectParser, parseStatement } from "../src/parsers/index.ts";
import type { PageText, ParseResult } from "../src/parsers/types.ts";

const read = (pages: PageText[]): ParseResult => genericParser.parse(pages);
const rows = (r: ParseResult) =>
  r.transactions.map((t) => [t.date, t.description, t.debit, t.credit, t.balance ?? null]);

const DATE = { label: "Date", x: 40 };
const DESC = { label: "Description", x: 110 };

describe("parseAmount", () => {
  it("reads peso amounts and their direction markers", () => {
    expect(parseAmount("1,234.56")).toEqual({ value: 123456, sign: 0 });
    expect(parseAmount("-1,234.56")).toEqual({ value: 123456, sign: -1 });
    expect(parseAmount("(1,234.56)")).toEqual({ value: 123456, sign: -1 });
    expect(parseAmount("1,234.56-")).toEqual({ value: 123456, sign: -1 });
    expect(parseAmount("1,234.56 DR")).toEqual({ value: 123456, sign: -1 });
    expect(parseAmount("1,234.56CR")).toEqual({ value: 123456, sign: 1 });
    expect(parseAmount("+PHP 2,500.00")).toEqual({ value: 250000, sign: 1 });
    expect(parseAmount("-₱150.00")).toEqual({ value: 15000, sign: -1 });
  });

  it("ignores reference numbers and other currencies", () => {
    expect(parseAmount("1000000000001")).toBeNull();
    expect(parseAmount("12345")).toBeNull();
    expect(parseAmount("$1,234.56")).toBeNull();
    expect(parseAmount("(1,234.56")).toBeNull();
  });
});

describe("parseDateToken", () => {
  it("reads common date formats, with or without a time", () => {
    expect(parseDateToken("2026-03-14")?.token).toEqual({ kind: "full", y: 2026, m: 3, d: 14 });
    expect(parseDateToken("Mar 14, 2026")?.token).toEqual({ kind: "full", y: 2026, m: 3, d: 14 });
    expect(parseDateToken("14 March 2026")?.token).toEqual({ kind: "full", y: 2026, m: 3, d: 14 });
    expect(parseDateToken("14-Mar-26")?.token).toEqual({ kind: "full", y: 2026, m: 3, d: 14 });
    expect(parseDateToken("03/04/2026")?.token).toEqual({ kind: "numeric", a: 3, b: 4, y: 2026 });
    expect(parseDateToken("May 13")?.token).toEqual({ kind: "noYear", m: 5, d: 13 });
    expect(parseDateToken("2026-03-14 01:05 PM")).toMatchObject({ time: "13:05" });
  });

  it("rejects things that aren't dates", () => {
    expect(parseDateToken("Payment")).toBeNull();
    expect(parseDateToken("13/13/2026")).toBeNull();
    expect(parseDateToken("Aug 1 1234")).toBeNull();
  });
});

describe("general reader", () => {
  it("reads separate debit/credit columns, wrapped descriptions, balances and the period", () => {
    const r = read(sampleGenericStatementPages());
    expect(r.source).toBe("generic");
    expect([r.periodStart, r.periodEnd]).toEqual(["2026-03-01", "2026-03-31"]);
    expect([r.openingBalance, r.closingBalance]).toEqual([1000000, 2480303]);
    expect(r.transactions).toHaveLength(8);
    expect(rows(r)[1]).toEqual([
      "2026-03-03",
      "Bills Payment SAMPLE ELECTRIC CO",
      245075,
      0,
      3254925,
    ]);
    expect(r.checks).toEqual({
      totalsMatchStatement: null,
      runningBalanceOk: true,
      openingToClosingOk: true,
    });
    expect(r.transactions.some((t) => t.flags)).toBe(false);
    expect(r.warnings[0]).toMatch(/general reader \(beta\)/);
  });

  it("reads one signed amount column (minus or brackets) and day/month dates", () => {
    const r = read(
      tablePages({
        columns: [DATE, DESC, { label: "Amount", x: 400, align: "right" }],
        rows: [
          ["02/03/2026", "Salary", "30,000.00"],
          ["15/03/2026", "Groceries", "-1,250.00"],
          ["20/03/2026", "Electricity", "(2,100.50)"],
        ],
      }),
    );
    expect(rows(r)).toEqual([
      ["2026-03-02", "Salary", 0, 3000000, null],
      ["2026-03-15", "Groceries", 125000, 0, null],
      ["2026-03-20", "Electricity", 210050, 0, null],
    ]);
    // No balances or totals: nothing to check, and the converter says so.
    expect(r.checks).toEqual({
      totalsMatchStatement: null,
      runningBalanceOk: null,
      openingToClosingOk: null,
    });
  });

  it("reads DR/CR markers printed as their own item", () => {
    const r = read(
      tablePages({
        columns: [
          DATE,
          DESC,
          { label: "Amount", x: 360, align: "right" },
          { label: "", x: 372 },
          { label: "Balance", x: 460, align: "right" },
        ],
        rows: [
          ["Mar 2, 2026", "Deposit", "5,000.00", "CR", "6,000.00"],
          ["Mar 3, 2026", "Bills", "700.00", "DR", "5,300.00"],
        ],
        above: ["Opening Balance 1,000.00"],
      }),
    );
    expect(rows(r)).toEqual([
      ["2026-03-02", "Deposit", 0, 500000, 600000],
      ["2026-03-03", "Bills", 70000, 0, 530000],
    ]);
    expect(r.checks.runningBalanceOk).toBe(true);
  });

  it("works out unmarked amounts from the running balance", () => {
    const r = read(
      tablePages({
        columns: [
          DATE,
          DESC,
          { label: "Amount", x: 360, align: "right" },
          { label: "Balance", x: 460, align: "right" },
        ],
        rows: [
          ["", "Beginning Balance", "", "1,000.00"],
          ["2026-03-02", "Transfer in", "500.00", "1,500.00"],
          ["2026-03-03", "Card purchase", "200.00", "1,300.00"],
        ],
      }),
    );
    expect(rows(r)).toEqual([
      ["2026-03-02", "Transfer in", 0, 50000, 150000],
      ["2026-03-03", "Card purchase", 20000, 0, 130000],
    ]);
  });

  it("flags unmarked amounts it can't place instead of guessing", () => {
    const r = read(
      tablePages({
        columns: [DATE, DESC, { label: "Amount", x: 400, align: "right" }],
        rows: [
          ["2026-03-02", "Something", "500.00"],
          ["2026-03-03", "Something else", "200.00"],
        ],
      }),
    );
    expect(r.transactions.map((t) => [t.debit, t.credit])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(r.transactions[0]?.flags?.[0]).toMatch(/money in or out/);
    expect(r.warnings.some((w) => /aren't marked as money in or out/.test(w))).toBe(true);
  });

  it("puts newest-first statements oldest first", () => {
    const r = read(
      tablePages({
        columns: [
          DATE,
          DESC,
          { label: "Debit", x: 330, align: "right" },
          { label: "Credit", x: 410, align: "right" },
        ],
        rows: [
          ["2026-03-20", "Later", "100.00", ""],
          ["2026-03-10", "Earlier", "", "300.00"],
        ],
      }),
    );
    expect(r.transactions.map((t) => t.description)).toEqual(["Earlier", "Later"]);
  });

  it("follows the table across pages, with or without a repeated header", () => {
    const table = (repeatHeader: boolean) =>
      tablePages({
        columns: [
          DATE,
          DESC,
          { label: "Withdrawal", x: 330, align: "right" },
          { label: "Deposit", x: 410, align: "right" },
        ],
        rows: Array.from({ length: 7 }, (_, n) => [
          `2026-03-${String(n + 1).padStart(2, "0")}`,
          `Row ${n + 1}`,
          "10.00",
          "",
        ]),
        rowsPerPage: 3,
        repeatHeader,
      });
    for (const repeat of [true, false]) {
      const r = read(table(repeat));
      expect(r.transactions.map((t) => t.description)).toEqual(
        Array.from({ length: 7 }, (_, n) => `Row ${n + 1}`),
      );
      expect(r.warnings.filter((w) => /couldn't read/.test(w))).toEqual([]);
    }
  });

  it("recognises two-line column names", () => {
    const r = read(
      tablePages({
        columns: [
          { label: ["Transaction", "Date"], x: 40 },
          { label: "Particulars", x: 110 },
          { label: ["Withdrawal", "Amount"], x: 320, align: "right" },
          { label: ["Deposit", "Amount"], x: 400, align: "right" },
          { label: ["Running", "Balance"], x: 480, align: "right" },
        ],
        rows: [["03/05/2026", "Cash deposit", "", "1,000.00", "1,000.00"]],
      }),
    );
    expect(rows(r)).toEqual([["2026-03-05", "Cash deposit", 0, 100000, 100000]]);
  });

  it("reads month/day dates and warns when every date could be read either way", () => {
    const decisive = read(
      tablePages({
        columns: [DATE, DESC, { label: "Amount", x: 400, align: "right" }],
        rows: [["03/14/2026", "A", "-1.00"]],
      }),
    );
    expect(decisive.transactions[0]?.date).toBe("2026-03-14");
    expect(decisive.warnings.some((w) => /month\/day/.test(w))).toBe(false);

    const ambiguous = read(
      tablePages({
        columns: [DATE, DESC, { label: "Amount", x: 400, align: "right" }],
        rows: [
          ["03/04/2026", "A", "-1.00"],
          ["03/05/2026", "B", "-1.00"],
        ],
      }),
    );
    expect(ambiguous.transactions.map((t) => t.date)).toEqual(["2026-03-04", "2026-03-05"]);
    expect(ambiguous.warnings.some((w) => /read them as month\/day/.test(w))).toBe(true);
  });

  it("gives a row its day's date when the statement prints the date once per day", () => {
    const r = read(
      tablePages({
        columns: [DATE, DESC, { label: "Amount", x: 400, align: "right" }],
        rows: [
          ["2026-03-02", "Coffee", "-120.00"],
          ["", "Lunch", "-250.00"],
          ["2026-03-03", "Salary", "+5,000.00"],
        ],
      }),
    );
    expect(r.transactions.map((t) => [t.date, t.description])).toEqual([
      ["2026-03-02", "Coffee"],
      ["2026-03-02", "Lunch"],
      ["2026-03-03", "Salary"],
    ]);
  });

  it("compares parsed totals with a totals line", () => {
    const r = read(
      tablePages({
        columns: [
          DATE,
          DESC,
          { label: "Debit", x: 330, align: "right" },
          { label: "Credit", x: 410, align: "right" },
        ],
        rows: [
          ["2026-03-02", "A", "100.00", ""],
          ["2026-03-03", "B", "", "300.00"],
        ],
        below: [["", "Total", "100.00", "300.00"]],
      }),
    );
    expect(r.statementTotals).toEqual({ debit: 10000, credit: 30000 });
    expect(r.checks.totalsMatchStatement).toBe(true);
  });

  it("doesn't accept PDFs without a transaction table, or amounts in other currencies", () => {
    const report: PageText[] = [
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        items: [{ str: "Quarterly report", x: 50, y: 60, width: 80, height: 12 }],
      },
    ];
    expect(genericParser.canParse(report)).toBe(false);
    const dollars = tablePages({
      columns: [DATE, DESC, { label: "Amount", x: 400, align: "right" }],
      rows: [["2026-03-02", "Coffee", "-$4.50"]],
    });
    expect(genericParser.canParse(dollars)).toBe(false);
  });
});

describe("parser registry", () => {
  const fixture = (name: string) =>
    (JSON.parse(readFileSync(`tests/fixtures/${name}-basic.json`, "utf8")) as { pages: PageText[] })
      .pages;

  it("keeps every supported bank on its own parser", () => {
    for (const name of ["gcash", "maya", "bpi", "bdo"]) {
      expect(parseStatement(fixture(name))?.source).toBe(name);
    }
  });

  it("falls back to the general reader for other statements", () => {
    expect(detectParser(sampleGenericStatementPages())).toBeNull();
    expect(parseStatement(sampleGenericStatementPages())?.source).toBe("generic");
  });

  // Benchmark: on the supported banks' layouts, the general reader gets the same dates, amounts,
  // balances and checks as the bank-specific parsers (descriptions may join columns differently).
  it.each(["gcash", "maya", "bpi", "bdo"])("matches the %s parser's figures", (name) => {
    const pages = fixture(name);
    const specific = detectParser(pages)!.parse(structuredClone(pages));
    const general = genericParser.parse(structuredClone(pages));
    const figures = (r: ParseResult) =>
      r.transactions.map((t) => [t.date, t.debit, t.credit, t.balance ?? null]);
    expect(figures(general)).toEqual(figures(specific));
    expect(general.checks).toEqual(specific.checks);
    expect(general.transactions.filter((t) => t.flags)).toEqual([]);
  });
});
