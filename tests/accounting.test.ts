import { describe, expect, it } from "vitest";
import {
  accountChoices,
  formatDate,
  toOfx,
  toQuickBooksCsv,
  toXeroCsv,
  type AccountExport,
} from "../src/export/accounting.ts";
import { categorize } from "../src/lib/categories.ts";
import { combine } from "../src/lib/combine.ts";
import { gcashParser } from "../src/parsers/gcash.ts";
import type { PageText, ParseResult } from "../src/parsers/types.ts";
import fixture from "./fixtures/gcash-basic.json";

const parsed = () => categorize(gcashParser.parse(structuredClone(fixture.pages) as PageText[]));
const account = (r: ParseResult = parsed()): AccountExport =>
  accountChoices(r, (s) => s.toUpperCase())[0]!.account;

describe("formatDate", () => {
  it("writes month/day or day/month", () => {
    expect(formatDate("2026-03-14", "mdy")).toBe("03/14/2026");
    expect(formatDate("2026-03-14", "dmy")).toBe("14/03/2026");
  });
});

describe("QuickBooks Online CSV", () => {
  const lines = toQuickBooksCsv(account(), "mdy").trimEnd().split("\r\n");

  it("uses the 3-column layout with payments negative and plain numbers", () => {
    expect(lines[0]).toBe("Date,Description,Amount");
    expect(lines).toHaveLength(10);
    expect(lines[1]).toBe("03/01/2026,Payment to Sample Coffee Shop,-150.00");
    expect(lines[2]).toMatch(/^03\/02\/2026,Received GCash from Sample Bank.*,2500\.00$/);
    expect(lines.slice(1).every((l) => /,-?\d+\.\d{2}$/.test(l))).toBe(true); // no ₱, no commas
  });

  it("quotes descriptions with commas", () => {
    expect(
      lines.some((l) => l.includes('"Payment to Sample Food, Merchant Transaction Number')),
    ).toBe(true);
  });

  it("leaves out rows without an amount (importers reject blank or zero amounts)", () => {
    const r = parsed();
    r.transactions[0] = { ...r.transactions[0]!, debit: 0, credit: 0 };
    expect(toQuickBooksCsv(account(r), "mdy").trimEnd().split("\r\n")).toHaveLength(9);
  });
});

describe("Xero CSV", () => {
  it("has one signed amount, payee, description (category) and reference", () => {
    const lines = toXeroCsv(account(), "dmy").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Amount,Payee,Description,Reference");
    expect(lines[1]).toBe("01/03/2026,-150.00,Payment to Sample Coffee Shop,Food,1000000000001");
  });
});

describe("OFX", () => {
  const ofx = toOfx(account(), new Date("2026-11-01T00:00:00Z"));

  it("is an OFX 1.0.2 bank statement with one STMTTRN per row", () => {
    expect(ofx.startsWith("OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102")).toBe(true);
    expect(ofx).toContain("<DTSERVER>20261101000000");
    expect(ofx).toContain("<CURDEF>PHP");
    expect(ofx).toContain("<DTSTART>20260301");
    expect(ofx).toContain("<DTEND>20260331");
    expect(ofx.match(/<STMTTRN>/g)).toHaveLength(9);
    expect(ofx).toContain("<TRNTYPE>DEBIT\r\n<DTPOSTED>20260301081500\r\n<TRNAMT>-150.00");
    expect(ofx).toContain("<LEDGERBAL>\r\n<BALAMT>11021.50\r\n<DTASOF>20260331");
  });

  it("keeps the OFX element order and field lengths", () => {
    const first = ofx.slice(ofx.indexOf("<STMTTRN>"), ofx.indexOf("</STMTTRN>"));
    const order = ["<TRNTYPE>", "<DTPOSTED>", "<TRNAMT>", "<FITID>", "<REFNUM>", "<NAME>"];
    const positions = order.map((tag) => first.indexOf(tag));
    expect(positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!))).toBe(true);
    for (const [, name] of ofx.matchAll(/<NAME>(.*)\r\n/g))
      expect(name!.length).toBeLessThanOrEqual(32);
    expect(ofx).toMatch(/<MEMO>Payment to Sample Food, Merchant Transaction Number/);
  });

  it("gives every row a unique, stable id", () => {
    const ids = [...ofx.matchAll(/<FITID>(\w+)/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(toOfx(account(), new Date())).toContain(`<FITID>${ids[0]}`);
  });

  it("stays plain ASCII and escapes markup characters", () => {
    const r = parsed();
    r.transactions[0] = { ...r.transactions[0]!, description: "Niño & Sons <₱ shop>" };
    const out = toOfx(account(r));
    expect(out).toContain("<NAME>Nino &amp; Sons &lt;PHP  shop&gt;");
    expect([...out].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  });

  it("doesn't invent a balance when the statement prints none", () => {
    const r = parsed();
    r.closingBalance = undefined;
    r.transactions = r.transactions.map((t) => ({ ...t, balance: undefined }));
    expect(toOfx(account(r))).not.toContain("<LEDGERBAL>");
  });
});

describe("accountChoices", () => {
  it("exports each account of a combined workbook separately", () => {
    const gcash = parsed();
    const bdo: ParseResult = {
      source: "bdo",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      transactions: [
        { date: "2026-03-05", description: "Payment via QRPH", debit: 20000, credit: 0 },
      ],
      warnings: [],
      checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
    };
    const wb = combine([
      { label: "GCash · March", result: gcash },
      { label: "BDO · March", result: bdo },
    ]);
    const choices = accountChoices(wb, (s) => s.toUpperCase());
    expect(choices.map((c) => [c.label, c.slug, c.account.transactions.length])).toEqual([
      ["GCash · March", "gcash", 9],
      ["BDO · March", "bdo", 1],
    ]);
    expect(choices[0]!.account.closingBalance).toBe(1102150);
  });
});
