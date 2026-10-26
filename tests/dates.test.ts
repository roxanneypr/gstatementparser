import { describe, expect, it } from "vitest";
import { parseDateTime } from "../src/lib/dates.ts";

describe("parseDateTime", () => {
  it.each([
    ["2026-03-14", { date: "2026-03-14" }],
    ["2026-03-14 01:05 PM", { date: "2026-03-14", time: "13:05" }],
    ["2026-03-14 12:00 AM", { date: "2026-03-14", time: "00:00" }],
    ["2026-03-14 12:30 PM", { date: "2026-03-14", time: "12:30" }],
    ["2026-03-14 23:59", { date: "2026-03-14", time: "23:59" }],
    ["2028-02-29 09:00 am", { date: "2028-02-29", time: "09:00" }],
  ])("%s", (input, expected) => {
    expect(parseDateTime(input)).toEqual(expected);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-03-14 13:00 PM", "2026-03-14 24:00", "14/03/2026"])(
    "rejects %s",
    (input) => {
      expect(parseDateTime(input)).toBeNull();
    },
  );
});
