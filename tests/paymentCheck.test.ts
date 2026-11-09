import { describe, expect, it } from "vitest";
import {
  checkPayments,
  MAX_LINES,
  normalizeRef,
  parsePaymentLine,
  parsePaymentText,
  paymentCounts,
} from "../src/lib/paymentCheck.ts";
import type { Transaction } from "../src/parsers/types.ts";

// FAKE rows in GCash statement wording.
const tx = (over: Partial<Transaction>): Transaction => ({
  date: "2026-03-01",
  description: "Transfer from 09190000003 to 09170000001",
  debit: 0,
  credit: 0,
  ...over,
});
const txs: Transaction[] = [
  tx({ referenceNo: "4000000000001", credit: 50000, balance: 60000 }),
  tx({ referenceNo: "4000000000002", debit: 18600, description: "Payment to Angkas" }),
  tx({ referenceNo: "4000000000003", credit: 150000 }),
  tx({
    referenceNo: "4000000000004",
    credit: 50000,
    balanceIssue: { kind: "unchanged", difference: -50000 },
  }),
  tx({ referenceNo: "BDO0A12345678", credit: 25000 }),
];

describe("normalizeRef", () => {
  it("keeps letters and digits only, upper-cased", () => {
    expect(normalizeRef("Ref. 4000 000 000001")).toBe("REF4000000000001");
    expect(normalizeRef("bdo-0a12345678")).toBe("BDO0A12345678");
  });
});

describe("parsePaymentLine", () => {
  it("reads a bare reference number, with or without spaces", () => {
    expect(parsePaymentLine("4000000000001")).toEqual({
      line: "4000000000001",
      refs: ["4000000000001"],
    });
    expect(parsePaymentLine("4000 000 000001").refs).toEqual(["4000000000001"]);
  });

  it("reads an amount marked with ₱ or PHP, or with centavos", () => {
    expect(parsePaymentLine("Ref No. 4000 000 000001 ₱500.00")).toMatchObject({
      refs: ["4000000000001"],
      amount: 50000,
    });
    expect(parsePaymentLine("PHP 1,500 4000000000003").amount).toBe(150000);
    expect(parsePaymentLine("4000000000003 1,500.00").amount).toBe(150000);
  });

  it("reads 'reference amount' pasted from a spreadsheet", () => {
    expect(parsePaymentLine("4000000000001\t500")).toMatchObject({
      refs: ["4000000000001"],
      amount: 50000,
    });
    expect(parsePaymentLine("500 4000000000001").amount).toBe(50000);
  });

  it("reads a whole GCash receipt message without taking the date or time as an amount", () => {
    const q = parsePaymentLine(
      "Sent GCash to JU** D. +63 917 000 0001 Amount ₱500.00 Ref No. 4000 000 000001 Nov 9, 2026 10:00 AM",
    );
    expect(q.amount).toBe(50000);
    expect(q.refs).toContain("4000000000001");
  });

  it("doesn't read a dotted date as an amount", () => {
    expect(parsePaymentLine("4000000000001 09.11.2026").amount).toBeUndefined();
  });

  it("reads a plain number as an amount", () => {
    expect(parsePaymentLine("500")).toEqual({ line: "500", refs: [], amount: 50000 });
  });

  it("reads alphanumeric bank references", () => {
    expect(parsePaymentLine("BDO0A12345678").refs).toEqual(["BDO0A12345678"]);
    expect(parsePaymentLine("Ref:4000000000001").refs).toEqual(["4000000000001"]);
    expect(parsePaymentLine("RefNo.4000000000001").refs).toEqual(["4000000000001"]);
  });

  it("finds nothing in text without a reference or amount", () => {
    expect(parsePaymentLine("thanks po!")).toEqual({ line: "thanks po!", refs: [] });
  });
});

describe("parsePaymentText", () => {
  it("drops blank lines and stops at MAX_LINES", () => {
    expect(parsePaymentText("\n4000000000001\n\n  \n500\n").queries).toHaveLength(2);
    const many = parsePaymentText(
      Array(MAX_LINES + 5)
        .fill("500")
        .join("\n"),
    );
    expect(many.queries).toHaveLength(MAX_LINES);
    expect(many.truncated).toBe(true);
  });
});

describe("checkPayments", () => {
  const check = (text: string) => checkPayments(txs, parsePaymentText(text).queries);

  it("finds money in by reference, and checks the amount when given", () => {
    const [byRef, withAmount, wrongAmount] = check(
      "4000000000003\n4000000000003 ₱1,500.00\n4000000000003 ₱1,000.00",
    );
    expect(byRef).toMatchObject({ status: "found", ref: "4000000000003" });
    expect(byRef?.matches.map((m) => m.row)).toEqual([3]);
    expect(withAmount?.status).toBe("found");
    expect(wrongAmount?.status).toBe("amountDiffers");
  });

  it("says when the reference is money going out", () => {
    expect(check("4000000000002")[0]?.status).toBe("notIncoming");
  });

  it("says 'not found' (never 'fake') for a reference the statement doesn't have", () => {
    expect(check("4999999999999")[0]).toMatchObject({ status: "notFound", matches: [] });
  });

  it("picks the reference the statement has when a message holds several numbers", () => {
    const [c] = check("from 09170000001 ref 4000000000001");
    expect(c).toMatchObject({ status: "found", ref: "4000000000001" });
  });

  it("only lists candidates for an amount without a reference", () => {
    const [c] = check("₱500.00");
    expect(c?.status).toBe("amountOnly");
    expect(c?.matches.map((m) => m.row)).toEqual([1, 4]);
    expect(check("₱777.00")[0]?.status).toBe("notFound");
  });

  it("points out a matched row whose balance didn't change", () => {
    expect(check("4000000000004")[0]).toMatchObject({ status: "found", balanceIssue: true });
    expect(check("4000000000001")[0]?.balanceIssue).toBe(false);
  });

  it("matches alphanumeric references regardless of case or dashes", () => {
    expect(check("bdo-0a12345678")[0]?.status).toBe("found");
  });

  it("marks lines with nothing to check", () => {
    expect(check("salamat")[0]?.status).toBe("unreadable");
  });

  it("counts results by status", () => {
    const counts = paymentCounts(check("4000000000001\n4999999999999\nsalamat"));
    expect(counts).toMatchObject({ found: 1, notFound: 1, unreadable: 1, amountOnly: 0 });
  });
});
