import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "../src/lib/money.ts";

describe("parseMoney", () => {
  it.each([
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["₱1,234.5", 123450],
    ["PHP 12", 1200],
    ["0.07", 7],
    ["-12.00", -1200],
    ["10000.00", 1000000],
  ])("%s -> %i centavos", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "1,23.45", "1.234", "12a", "1.2.3"])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("sums without float drift", () => {
    const total = ["0.10", "0.20"].reduce((s, v) => s + (parseMoney(v) ?? 0), 0);
    expect(total).toBe(30);
  });
});

describe("formatMoney", () => {
  it("formats centavos", () => {
    expect(formatMoney(123456)).toBe("1,234.56");
    expect(formatMoney(5)).toBe("0.05");
    expect(formatMoney(-150)).toBe("-1.50");
  });
});
