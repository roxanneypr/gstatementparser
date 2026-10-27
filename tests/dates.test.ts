import { describe, expect, it } from "vitest";
import {
  formatPeriod,
  parseClockTime,
  parseDateTime,
  parseDayMonthYear,
} from "../src/lib/dates.ts";

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

describe("formatPeriod", () => {
  it("shows the year once within a year, twice across years", () => {
    expect(formatPeriod("2026-09-21", "2026-10-18")).toBe("Sep 21 – Oct 18, 2026");
    expect(formatPeriod("2025-12-21", "2026-01-18")).toBe("Dec 21, 2025 – Jan 18, 2026");
    expect(formatPeriod("2026-03-01", "2026-03-01")).toBe("Mar 1, 2026");
  });
});

describe("parseDayMonthYear (Maya)", () => {
  it.each([
    ["9 Sep 2026", "2026-09-09"],
    ["30 Sep 2026", "2026-09-30"],
    ["1 September 2026", "2026-09-01"],
    ["29 Feb 2028", "2028-02-29"],
  ])("%s", (input, expected) => {
    expect(parseDayMonthYear(input)).toBe(expected);
  });

  it.each(["31 Sep 2026", "29 Feb 2026", "9 Foo 2026", "2026-09-09", "Sep 9 2026"])(
    "rejects %s",
    (input) => {
      expect(parseDayMonthYear(input)).toBeNull();
    },
  );
});

describe("parseClockTime (Maya)", () => {
  it.each([
    ["10:12:13 PM", "22:12"],
    ["12:00:00 AM", "00:00"],
    ["12:30:10 PM", "12:30"],
    ["08:05 am", "08:05"],
    ["23:59", "23:59"],
  ])("%s", (input, expected) => {
    expect(parseClockTime(input)).toBe(expected);
  });

  it.each(["13:00:00 PM", "24:00", "9 Sep 2026"])("rejects %s", (input) => {
    expect(parseClockTime(input)).toBeNull();
  });
});
