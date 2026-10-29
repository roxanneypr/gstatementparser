import { describe, expect, it } from "vitest";
import { categorize, categoryKey, guessCategory, isCategory } from "../src/lib/categories.ts";
import { summarize } from "../src/lib/summary.ts";
import { filterTransactions } from "../src/lib/txView.ts";
import { gcashParser } from "../src/parsers/gcash.ts";
import type { PageText } from "../src/parsers/types.ts";
import fixture from "./fixtures/gcash-basic.json";

const out = (description: string) => guessCategory({ description, debit: 100, credit: 0 });
const inn = (description: string) => guessCategory({ description, debit: 0, credit: 100 });

describe("guessCategory", () => {
  it("reads GCash wording", () => {
    expect(inn("Received GCash from BPI with account ending in 1234")).toBe("Money received");
    expect(out("Transfer from 09170000001 to 09180000002")).toBe("Money sent");
    expect(inn("Transfer from 09180000002 to 09170000001")).toBe("Money received");
    expect(inn("Refund from Grab Philippines")).toBe("Refunds");
    expect(out("Payment to Angkas")).toBe("Transport");
    expect(out("Payment to Foodpanda")).toBe("Food");
    expect(out("Payment to Shopee")).toBe("Shopping");
    expect(out("Payment to Netflix")).toBe("Subscriptions");
    // Wording seen on a real GCash statement
    expect(out("Payment to 7 Eleven Sample Branch")).toBe("Shopping");
    expect(out("Payment to TikTok Repayment")).toBe("Bills");
    expect(out("Payment to Sample Loans Repayment")).toBe("Bills");
    expect(out("Payment to Sample Merchant, Merchant Transaction Number: abc")).toBe("Payments");
  });

  it("reads Maya wording", () => {
    expect(inn("Cash in · Sample Bank")).toBe("Cash in");
    expect(out("Sent to bank · Instapay Sending")).toBe("Money sent");
    expect(out("Sent to Maya user · Transfer to 639170******1234")).toBe("Money sent");
    expect(out("Paid bill · Pay with PayMaya Wallet Bills Pay")).toBe("Bills");
    expect(out("Purchased · PWM Authorization")).toBe("Payments");
  });

  it("reads BPI wording", () => {
    expect(out("InstaPay Transfer Fee · TRANSFER TO OTHER BANK")).toBe("Fees & taxes");
    expect(out("InstaPay Transfer · TRANSFER TO OTHER BANK")).toBe("Money sent");
    expect(out("ATM Withdrawal-BPI@SAMPLE MALL")).toBe("Cash withdrawal");
    expect(out("Purchase-MC @SAMPLE STORE")).toBe("Payments");
    expect(inn("Bizlink Payroll · BIZLINK")).toBe("Salary");
    expect(inn("INTEREST EARNED")).toBe("Interest");
    expect(out("TAX WITHHELD")).toBe("Fees & taxes");
  });

  it("reads BDO wording", () => {
    expect(out("Payment via QRPH")).toBe("Payments");
    expect(out("Sent to ****1234")).toBe("Money sent");
    expect(out("Sent via Instapay GXI")).toBe("Money sent");
    expect(inn("Received from Other Bank")).toBe("Money received");
    expect(out("W/D FR SAV BDO/000001")).toBe("Cash withdrawal");
    expect(out("POS W/D SV SAMPLE STORE")).toBe("Payments"); // a card purchase, not cash
    expect(out("SERVICE CHG SYS-GEN")).toBe("Fees & taxes");
    expect(out("INTEREST WITHHELD")).toBe("Fees & taxes");
    expect(inn("INTEREST PAY SYS-GEN")).toBe("Interest");
    expect(out("Prepaid Reload to ****1234")).toBe("Load");
  });

  it("says Other instead of guessing", () => {
    expect(out("Something unusual")).toBe("Other");
    expect(inn("Payment to Sample Merchant")).toBe("Other"); // money in, not a payment out
    expect(out("Coffee")).toBe("Food"); // "fee" inside a word isn't a fee
  });
});

describe("categoryKey", () => {
  it("ignores per-payment numbers but keeps who the money went to", () => {
    expect(categoryKey("Payment to Sample Food, Merchant Transaction Number: sub-1")).toBe(
      categoryKey("Payment to  Sample Food, Merchant Transaction Number: sub-2"),
    );
    expect(categoryKey("Transfer from 0917 to 0918")).not.toBe(
      categoryKey("Transfer from 0917 to 0919"),
    );
  });
});

describe("categorize", () => {
  const parsed = () => gcashParser.parse(structuredClone(fixture.pages) as PageText[]);

  it("labels every row without touching the figures", () => {
    const before = parsed();
    const after = categorize(before);
    expect(after.transactions.every((t) => t.category && isCategory(t.category))).toBe(true);
    const stripped = after.transactions.map((t) => {
      const copy = { ...t };
      delete copy.category;
      return copy;
    });
    expect(stripped).toEqual(before.transactions);
    expect(before.transactions.some((t) => "category" in t)).toBe(false); // input not mutated
  });

  it("applies a user's change to every row with the same description", () => {
    const res = parsed();
    const desc = res.transactions.find((t) => t.description.startsWith("Payment to Sample Ride"))!;
    const changed = categorize(res, new Map([[categoryKey(desc.description), "Bills"]]));
    const rides = changed.transactions.filter((t) => t.description === desc.description);
    expect(rides.length).toBeGreaterThan(0);
    expect(rides.every((t) => t.category === "Bills")).toBe(true);
    // the refund from the same merchant has a different description, so it keeps its guess
    expect(changed.transactions.find((t) => t.description.startsWith("Refund"))?.category).toBe(
      "Refunds",
    );
  });

  it("feeds the category totals and the category filter", () => {
    const res = categorize(parsed());
    const s = summarize(res);
    expect(s.categories.reduce((n, c) => n + c.count, 0)).toBe(s.count);
    expect(s.categories.reduce((n, c) => n + c.moneyOut, 0)).toBe(s.moneyOut);
    expect(s.categories[0]!.moneyOut).toBeGreaterThanOrEqual(s.categories[1]!.moneyOut);
    const food = filterTransactions(res.transactions, {
      filter: "all",
      month: "",
      search: "",
      category: "Food",
    });
    expect(food.map((r) => r.tx.category)).toEqual(["Food", "Food"]);
    expect(summarize(parsed()).categories).toEqual([]); // uncategorized input: no table
  });
});
