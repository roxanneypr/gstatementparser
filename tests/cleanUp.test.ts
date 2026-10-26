import { describe, expect, it } from "vitest";
import { cleanUp, countUnchanged } from "../src/lib/cleanUp.ts";
import { gcashParser } from "../src/parsers/gcash.ts";
import type { PageText, ParseResult } from "../src/parsers/types.ts";
import fixture from "./fixtures/gcash-basic.json";

const parse = (mutate?: (pages: PageText[]) => void): ParseResult => {
  const pages = structuredClone(fixture.pages) as PageText[];
  mutate?.(pages);
  return gcashParser.parse(pages);
};

/** Row 5 (debit 85.50) is listed but the printed balance doesn't move: the real-world pattern. */
const withUnchangedRow = () =>
  parse((pages) => {
    const item = pages[0]!.items.find((i) => i.str === "2769.50")!;
    item.str = "2855.00";
    // ...and the rest of the statement continues from the unchanged balance.
    for (const p of pages)
      for (const i of p.items) {
        const map: Record<string, string> = {
          "2420.50": "2506.00",
          "1170.50": "1256.00",
          "1021.50": "1107.00",
          "11021.50": "11107.00",
        };
        if (map[i.str]) i.str = map[i.str]!;
      }
  });

describe("cleanUp", () => {
  it("does nothing when no row is unchanged", () => {
    const r = parse();
    expect(countUnchanged(r)).toBe(0);
    expect(cleanUp(r)).toBe(r);
  });

  it("removes only unchanged-balance rows and recomputes the balance checks", () => {
    const r = withUnchangedRow();
    expect(countUnchanged(r)).toBe(1);
    expect(r.checks.runningBalanceOk).toBe(false);

    const c = cleanUp(r);
    expect(c.transactions).toHaveLength(8);
    expect(c.transactions.some((t) => t.debit === 8550)).toBe(false);
    expect(c.cleanedUp).toEqual({ removed: 1 });
    expect(c.checks.runningBalanceOk).toBe(true);
    expect(c.checks.openingToClosingOk).toBe(true);
    // The original result is untouched.
    expect(r.transactions).toHaveLength(9);
  });
});
