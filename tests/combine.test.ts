import { read, utils } from "xlsx";
import { describe, expect, it } from "vitest";
import { toCsv } from "../src/export/toCsv.ts";
import { toXlsx } from "../src/export/toXlsx.ts";
import { categorize } from "../src/lib/categories.ts";
import { combine } from "../src/lib/combine.ts";
import { exportBaseName, summarize } from "../src/lib/summary.ts";
import type { ParseResult, Transaction } from "../src/parsers/types.ts";

type Row = [date: string, description: string, debit: number, credit: number, balance?: number];

/** A FAKE parsed statement (centavos). */
function stmt(
  source: ParseResult["source"],
  [periodStart, periodEnd]: [string, string],
  rows: Row[],
  extra: Partial<ParseResult> = {},
): ParseResult {
  const transactions: Transaction[] = rows.map(([date, description, debit, credit, balance]) => ({
    date,
    description,
    debit,
    credit,
    ...(balance !== undefined ? { balance } : {}),
  }));
  return {
    source,
    periodStart,
    periodEnd,
    transactions,
    warnings: [],
    checks: { totalsMatchStatement: true, runningBalanceOk: true, openingToClosingOk: true },
    ...extra,
  };
}

const march = stmt(
  "gcash",
  ["2026-03-01", "2026-03-31"],
  [
    ["2026-03-02", "Payment to Angkas", 15000, 0, 85000],
    ["2026-03-20", "Received GCash from BPI", 0, 50000, 135000],
  ],
  { openingBalance: 100000, closingBalance: 135000 },
);
const april = stmt(
  "gcash",
  ["2026-04-01", "2026-04-30"],
  [
    ["2026-04-03", "Payment to Foodpanda", 30000, 0, 105000],
    ["2026-04-10", "Payment to Angkas", 5000, 0, 100000],
  ],
  { openingBalance: 135000, closingBalance: 100000 },
);

describe("combine", () => {
  it("a single statement stays as it is", () => {
    const wb = combine([{ label: "GCash March", result: march }]);
    expect(wb.source).toBe("gcash");
    expect(wb.transactions.map((t) => t.description)).toEqual(
      march.transactions.map((t) => t.description),
    );
    expect(wb.checks).toEqual(march.checks);
    expect(exportBaseName(wb)).toBe("gcash-statement_2026-03-01_to_2026-03-31");
    expect(toCsv(wb).split("\r\n")[0]).not.toContain("Statement");
  });

  it("merges consecutive statements in date order, oldest first whatever the input order", () => {
    const wb = combine([
      { label: "April", result: april },
      { label: "March", result: march },
    ]);
    expect(wb.transactions.map((t) => t.date)).toEqual([
      "2026-03-02",
      "2026-03-20",
      "2026-04-03",
      "2026-04-10",
    ]);
    expect(wb.statements.map((s) => s.label)).toEqual(["March", "April"]);
    expect(wb.transactions.map((t) => t.statement)).toEqual([0, 0, 1, 1]);
    expect([wb.periodStart, wb.periodEnd]).toEqual(["2026-03-01", "2026-04-30"]);
    expect([wb.openingBalance, wb.closingBalance]).toEqual([100000, 100000]);
    expect(wb.warnings).toEqual([]);
    expect(exportBaseName(wb)).toBe("gcash-statements_2026-03-01_to_2026-04-30");
  });

  it("leaves out rows from overlapping statements of the same account, and says so", () => {
    const midMarchToApril = stmt(
      "gcash",
      ["2026-03-15", "2026-04-15"],
      [march.transactions[1], ...april.transactions].map(
        (t) => [t.date, t.description, t.debit, t.credit, t.balance] as Row,
      ),
    );
    const wb = combine([
      { label: "March", result: march },
      { label: "Mid-March to mid-April", result: midMarchToApril },
    ]);
    expect(wb.transactions).toHaveLength(4);
    expect(wb.duplicates).toEqual({ found: 1, removed: true });
    expect(wb.statements[1]?.duplicates).toBe(1);
    expect(wb.warnings).toContain(
      "1 row was left out because it's also in an overlapping statement.",
    );

    const kept = combine(
      [
        { label: "March", result: march },
        { label: "Mid-March to mid-April", result: midMarchToApril },
      ],
      { keepDuplicates: true },
    );
    expect(kept.transactions).toHaveLength(5);
    expect(kept.duplicates).toEqual({ found: 1, removed: false });
  });

  it("keeps identical rows inside one statement (two equal rides on one day are real)", () => {
    const twice = stmt(
      "gcash",
      ["2026-05-01", "2026-05-31"],
      [
        ["2026-05-02", "Payment to Angkas", 5000, 0],
        ["2026-05-02", "Payment to Angkas", 5000, 0],
      ],
    );
    const wb = combine([
      { label: "May", result: twice },
      { label: "April", result: april },
    ]);
    expect(wb.transactions.filter((t) => t.date === "2026-05-02")).toHaveLength(2);
    expect(wb.duplicates.found).toBe(0);
  });

  it("only treats rows as duplicates within the same account", () => {
    const bpiMarch = stmt(
      "bpi",
      ["2026-03-01", "2026-03-31"],
      [["2026-03-02", "Payment to Angkas", 15000, 0, 85000]],
    );
    const wb = combine([
      { label: "GCash", result: march },
      { label: "BPI", result: bpiMarch },
    ]);
    expect(wb.duplicates.found).toBe(0);
    expect(wb.transactions).toHaveLength(3);
  });

  it("reports missing dates and balances that don't carry over", () => {
    const may = stmt("gcash", ["2026-05-01", "2026-05-31"], [["2026-05-05", "A", 100, 0]], {
      openingBalance: 99_999,
      closingBalance: 99_899,
    });
    const gap = combine([
      { label: "March", result: march },
      { label: "May", result: may },
    ]);
    expect(gap.warnings).toContain(
      'No statement covers 2026-04-01 to 2026-04-30 (between "March" and "May").',
    );
    const aprilWrongStart = { ...april, openingBalance: 130000 };
    const broken = combine([
      { label: "March", result: march },
      { label: "April", result: aprilWrongStart },
    ]);
    expect(broken.warnings).toContain(
      '"March" ends with ₱1,350.00 but "April" starts with ₱1,300.00.',
    );
  });

  it("combines different banks without inventing a shared balance", () => {
    const bdo = stmt(
      "bdo",
      ["2026-03-01", "2026-03-31"],
      [["2026-03-05", "Payment via QRPH", 20000, 0]],
      {
        checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
      },
    );
    const wb = combine([
      { label: "GCash March", result: march },
      { label: "BDO March", result: bdo },
    ]);
    expect(wb.source).toBe("mixed");
    expect(wb.accounts).toBe(2);
    expect(wb.openingBalance).toBeUndefined();
    expect(wb.closingBalance).toBeUndefined();
    expect(wb.checks).toEqual({
      totalsMatchStatement: true,
      runningBalanceOk: true,
      openingToClosingOk: true,
    });
    expect(wb.warnings.some((w) => /different accounts/.test(w))).toBe(true);
    expect(exportBaseName(wb)).toBe("wallettoexcel_2026-03-01_to_2026-03-31");
  });

  it("a failed check in any statement fails the combined check", () => {
    const bad = { ...april, checks: { ...april.checks, runningBalanceOk: false } };
    const wb = combine([
      { label: "March", result: march },
      { label: "April", result: bad },
    ]);
    expect(wb.checks.runningBalanceOk).toBe(false);
    expect(wb.checks.totalsMatchStatement).toBe(true);
  });

  it("labels each statement's warnings", () => {
    const warned = { ...april, warnings: ["Ending balance not found."] };
    const wb = combine([
      { label: "March", result: march },
      { label: "April", result: warned },
    ]);
    expect(wb.warnings).toContain("April: Ending balance not found.");
  });
});

describe("combined exports", () => {
  const wb = categorize(
    combine([
      { label: "GCash · March", result: march },
      { label: "GCash · April", result: april },
    ]),
  );

  it("adds a Statement column after Category in the CSV", () => {
    const lines = toCsv(wb).slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toMatch(/,Category,Statement$/);
    expect(lines[1]).toMatch(/,Transport,GCash · March$/);
    expect(lines[4]).toMatch(/,GCash · April$/);
  });

  it("adds the Statement column, a per-statement table and a spending-by-month sheet", () => {
    const book = read(toXlsx(wb), { type: "array" });
    expect(book.SheetNames).toEqual(["Transactions", "Summary", "Spending by month"]);
    const tx = book.Sheets.Transactions!;
    expect(tx.J1?.v).toBe("Category");
    expect(tx.K1?.v).toBe("Statement");
    expect(tx.K5?.v).toBe("GCash · April");

    const summary = utils.sheet_to_json<unknown[]>(book.Sheets.Summary!, { header: 1, raw: true });
    expect(summary[0]?.[0]).toBe("GCash statements summary");
    expect(summary.find((r) => r[0] === "Statements")?.[1]).toBe(2);
    const head = summary.findIndex((r) => r[0] === "Statement");
    expect(summary[head + 1]?.[0]).toBe("GCash · March");
    expect(summary[head + 2]?.slice(5, 10)).toEqual([0, 350, 2, 0, "OK"]);

    const spending = utils.sheet_to_json<unknown[]>(book.Sheets["Spending by month"]!, {
      header: 1,
      raw: true,
    });
    expect(spending[0]?.length).toBe(4); // Category, Mar, Apr, Total
    const transport = spending.find((r) => r[0] === "Transport");
    expect(transport?.slice(1)).toEqual([150, 50, 200]);
    expect(spending[spending.length - 1]).toEqual(["Total", 150, 350, 500]);
  });

  it("keeps single-month, single-statement files to two sheets", () => {
    const book = read(toXlsx(categorize(combine([{ label: "March", result: march }]))), {
      type: "array",
    });
    expect(book.SheetNames).toEqual(["Transactions", "Summary"]);
    expect(book.Sheets.Transactions!.K1).toBeUndefined();
  });

  it("totals across statements", () => {
    const s = summarize(wb);
    expect([s.count, s.moneyIn, s.moneyOut]).toEqual([4, 50000, 50000]);
    expect(s.months.map((m) => m.month)).toEqual(["2026-03", "2026-04"]);
  });
});
