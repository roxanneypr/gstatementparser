import { describe, expect, it } from "vitest";
import { readReceiptText, receiptLine } from "../src/lib/receiptText.ts";

// OCR text of FAKE receipts (made-up names and numbers), with the kind of noise OCR produces.
const receipt = [
  "Sent via GCash",
  "JU** D.",
  "+63 917 000 0001",
  "Amount 500.00",
  "Total Amount Sent P500.00",
  "Ref No. 4000 000 000001  Nov 9, 2026 10:00 AM",
].join("\n");

describe("readReceiptText", () => {
  it("reads the reference number after 'Ref No.' and the amount", () => {
    expect(readReceiptText(receipt)).toEqual({
      ref: "4000000000001",
      amount: 50000,
      date: "2026-11-09",
    });
  });

  it("fixes look-alike letters inside the reference number", () => {
    expect(readReceiptText("Ref No. 4OOO OOO OOOOl2").ref).toBe("4000000000012");
  });

  it("doesn't run the reference into the next word", () => {
    expect(readReceiptText("Ref No. 4000000000001 Sent").ref).toBe("4000000000001");
  });

  it("prefers a reference the statement has", () => {
    const text = "Ref No. 4000 000 000009\nTxn 4000000000003";
    expect(readReceiptText(text, new Set(["4000000000003"])).ref).toBe("4000000000003");
    expect(readReceiptText(text).ref).toBe("4000000000009");
  });

  it("takes a long number without a label, but not a mobile number", () => {
    expect(readReceiptText("09170000001\n4000000000005\n₱75.00")).toEqual({
      ref: "4000000000005",
      amount: 7500,
    });
    expect(readReceiptText("Sent to 09170000001").ref).toBeUndefined();
  });

  // Regression (real GCash QR payment receipt, numbers replaced): a 9-digit "Reference No." in a
  // two-column layout, where OCR reads the label and value apart and the copy icon after the
  // number as a stray "0".
  it("drops the copy icon read as a digit after a reference number", () => {
    const text = "Amount 350.00\nTotal\n| 812345678 0\n045001 0\nReference No.\nDate";
    expect(readReceiptText(text)).toEqual({ ref: "812345678", amount: 35000 });
    expect(readReceiptText("Ref No. 812345678 0").ref).toBe("812345678");
    // ...unless the statement has the joined number.
    expect(readReceiptText(text, new Set(["8123456780"])).ref).toBe("8123456780");
  });

  it("reads a 13-digit reference printed next to its label, as on GCash 'Sent via GCash' receipts", () => {
    const text =
      "Amount\n1,000.00\nTotal Amount Sent\nP1000.00\nRef No. 7000000000001\nAug 31, 2026 6:54 PM";
    expect(readReceiptText(text)).toEqual({
      ref: "7000000000001",
      amount: 100000,
      date: "2026-08-31",
    });
  });

  // Regression (real GCash receipts): OCR drops the space after the comma in the date.
  it("reads a date written as 'Oct 14,2026'", () => {
    expect(readReceiptText("Ref No. 7000000000002\nOct 14,2026 2:31 PM").date).toBe("2026-10-14");
  });

  it("uses the 'Amount' line when the fee makes the total different", () => {
    const text = "Amount ₱1,000.00\nFee ₱15.00\nTotal ₱1,015.00\nRef No. 4000000000007";
    expect(readReceiptText(text).amount).toBe(100000);
  });

  it("leaves the amount out when it can't tell which one is meant", () => {
    expect(readReceiptText("₱1,000.00\n₱15.00").amount).toBeUndefined();
  });

  it("returns nothing for text without a reference or amount", () => {
    expect(readReceiptText("Thank you!")).toEqual({});
  });
});

describe("receiptLine", () => {
  it("builds the checker line", () => {
    expect(receiptLine({ ref: "4000000000001", amount: 50000 })).toBe("4000000000001 ₱500.00");
    expect(receiptLine({ ref: "4000000000001", amount: 50000, date: "2026-11-05" })).toBe(
      "4000000000001 ₱500.00 Nov 5, 2026",
    );
    expect(receiptLine({ date: "2026-11-05" })).toBe("");
    expect(receiptLine({ amount: 7500 })).toBe("₱75.00");
    expect(receiptLine({})).toBe("");
  });
});
