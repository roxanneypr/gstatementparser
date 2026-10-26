import { describe, expect, it } from "vitest";
import { groupRows, redactText, toPageText } from "../src/pdf/pageText.ts";

const item = (str: string, x: number, yFromBottom: number) => ({
  str,
  transform: [1, 0, 0, 1, x, yFromBottom],
  width: 10,
  height: 8,
});

describe("toPageText", () => {
  it("flips y to top-down and drops blanks and marked content", () => {
    const page = toPageText(1, 800, 600, [
      item("A", 10, 700),
      item("  ", 20, 700),
      { type: "beginMarkedContent" },
    ]);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ str: "A", x: 10, y: 100 });
  });
});

describe("groupRows", () => {
  it("groups by y within tolerance and sorts by x", () => {
    const page = toPageText(1, 800, 600, [
      item("right", 300, 700),
      item("left", 10, 701),
      item("next", 10, 680),
    ]);
    const rows = groupRows(page.items);
    expect(rows.map((r) => r.items.map((i) => i.str))).toEqual([["left", "right"], ["next"]]);
  });
});

describe("redactText", () => {
  it("masks digits and emails but keeps shape", () => {
    expect(redactText("₱1,234.56 a.b@x.com")).toBe("₱9,999.99 <email>");
  });
});
