import { CFB, read, utils } from "xlsx";
import { describe, expect, it } from "vitest";
import { csvText, toCsv } from "../src/export/toCsv.ts";
import { excelDate, excelTime, toXlsx } from "../src/export/toXlsx.ts";
import { categorize } from "../src/lib/categories.ts";
import { exportBaseName, summarize } from "../src/lib/summary.ts";
import { gcashParser } from "../src/parsers/gcash.ts";
import type { PageText, ParseResult } from "../src/parsers/types.ts";
import fixture from "./fixtures/gcash-basic.json";

const parsed = (): ParseResult => gcashParser.parse(structuredClone(fixture.pages) as PageText[]);

/** Same fixture, with row 5's balance printed unchanged (the real-statement pattern). */
function withBalanceGap(): ParseResult {
  const pages = structuredClone(fixture.pages) as PageText[];
  const item = pages[0]!.items.find((i) => i.str === "2769.50")!;
  item.str = "2855.00";
  return gcashParser.parse(pages);
}

describe("summarize", () => {
  it("totals in/out/net and months in centavos", () => {
    const s = summarize(parsed());
    expect(s).toMatchObject({ count: 9, moneyIn: 1250500, moneyOut: 298350, net: 952150 });
    expect(s).toMatchObject({ countIn: 3, countOut: 6 });
    expect(s.months).toEqual([{ month: "2026-03", moneyIn: 1250500, moneyOut: 298350, count: 9 }]);
  });

  it("names files after the period", () => {
    expect(exportBaseName(parsed())).toBe("gcash-statement_2026-03-01_to_2026-03-31");
  });
});

describe("toCsv", () => {
  const csv = toCsv(categorize(parsed()));
  const lines = csv.slice(1).trimEnd().split("\r\n");

  it("starts with a UTF-8 BOM and uses CRLF", () => {
    expect(csv.startsWith("﻿Date,Time,Description")).toBe(true);
    expect(csv.includes("\n") && !/[^\r]\n/.test(csv)).toBe(true);
  });

  it("writes one line per transaction with plain numeric amounts", () => {
    expect(lines).toHaveLength(10);
    expect(lines[1]).toBe(
      "2026-03-01,08:15,Payment to Sample Coffee Shop,1000000000001,150.00,,1350.00,OK,,Food",
    );
    expect(lines[9]).toContain(",,10000.00,11021.50,OK,");
  });

  it("quotes descriptions containing commas", () => {
    expect(lines[6]).toContain(
      '"Payment to Sample Food, Merchant Transaction Number: sub-AbCd1234EfGh"',
    );
  });

  it("labels balance gaps without changing the statement's figures", () => {
    const gap = toCsv(withBalanceGap()).split("\r\n");
    expect(gap[5]).toContain(",85.50,,2855.00,Balance didn't change,");
    expect(gap[6]).toContain(",349.00,,2420.50,Off by -85.50,");
  });

  it("escapes quotes and neutralises formula injection", () => {
    expect(csvText('say "hi"')).toBe('"say ""hi"""');
    expect(csvText("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvText("-5")).toBe(`"'-5"`);
    expect(csvText("plain")).toBe("plain");
  });
});

describe("toXlsx", () => {
  const bytes = toXlsx(categorize(withBalanceGap()));
  const wb = read(bytes, { type: "array", cellNF: true });

  it("has Transactions and Summary sheets", () => {
    expect(wb.SheetNames).toEqual(["Transactions", "Summary"]);
  });

  it("writes real dates/times, peso-formatted amounts and an autofilter", () => {
    const ws = wb.Sheets.Transactions!;
    expect(ws.A2).toMatchObject({ t: "n", v: excelDate("2026-03-01") });
    expect(ws.A2?.z).toBe("yyyy-mm-dd");
    expect(ws.B2?.v).toBeCloseTo(excelTime("08:15"));
    expect(ws.D2).toMatchObject({ t: "s", v: "1000000000001" });
    expect(ws.E2).toMatchObject({ t: "n", v: 150 });
    expect(ws.E2?.z).toBe('"₱"#,##0.00');
    expect(ws.H6?.v).toBe("Balance didn't change");
    expect(ws["!autofilter"]?.ref).toBe("A1:J10");
    expect(ws.J1?.v).toBe("Category"); // column J: the budget blog post's SUMIFS uses J:J
    expect(ws.J2?.v).toBe("Food");
    expect(utils.sheet_to_json(ws)).toHaveLength(9);
  });

  it("freezes the header row", () => {
    const zip = CFB.read(bytes, { type: "array" });
    const xml = new TextDecoder().decode(
      CFB.find(zip, "/xl/worksheets/sheet1.xml")!.content as Uint8Array,
    );
    expect(xml).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    );
  });

  it("summarises period, totals, checks and months", () => {
    // read without number formats so date cells come back as raw serials
    const summary = read(bytes, { type: "array" }).Sheets.Summary!;
    const rows = utils.sheet_to_json<unknown[]>(summary, { header: 1, raw: true });
    const find = (label: string) => rows.find((r) => r[0] === label)?.[1];
    expect(find("Period start")).toBe(excelDate("2026-03-01"));
    expect(find("Total in (credits)")).toBe(12505);
    expect(find("Total out (debits)")).toBe(2983.5);
    expect(find("Transactions")).toBe(9);
    expect(find("Totals match the statement")).toBe("Yes");
    expect(find("Every row's balance follows the previous row")).toBe("No");
    expect(find("Rows where the balance didn't change")).toBe(1);
    const monthRow = rows.find((r) => r[0] === excelDate("2026-03-01") && r.length === 4);
    expect(monthRow?.slice(1)).toEqual([12505, 2983.5, 9521.5]);
  });

  it("totals each category in the Summary sheet", () => {
    const rows = utils.sheet_to_json<unknown[]>(wb.Sheets.Summary!, { header: 1, raw: true });
    const head = rows.findIndex((r) => r[0] === "Category");
    expect(rows[head]).toEqual(["Category", "In", "Out", "Transactions"]);
    expect(rows.slice(head + 1).find((r) => r[0] === "Food")).toEqual(["Food", 0, 499, 2]);
  });

  it("records clean-up in the Summary sheet", () => {
    const cleaned = { ...withBalanceGap(), cleanedUp: { removed: 1 } };
    const rows = utils.sheet_to_json<unknown[]>(
      read(toXlsx(cleaned), { type: "array" }).Sheets.Summary!,
      { header: 1, raw: true },
    );
    expect(rows.find((r) => r[0] === "Removed by clean-up (balance didn't change)")?.[1]).toBe(1);
    // ...and not when clean-up wasn't used
    expect(rows.length).toBeGreaterThan(0);
    const plain = utils.sheet_to_json<unknown[]>(
      read(toXlsx(withBalanceGap()), { type: "array" }).Sheets.Summary!,
      { header: 1 },
    );
    expect(plain.some((r) => String(r[0]).startsWith("Removed by clean-up"))).toBe(false);
  });

  it("converts dates to Excel serials", () => {
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-03-14")).toBe(46095);
  });
});
