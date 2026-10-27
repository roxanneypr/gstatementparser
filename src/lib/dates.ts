export interface DateTime {
  /** ISO "YYYY-MM-DD" */
  date: string;
  /** 24-hour "HH:mm" if present */
  time?: string;
}

const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?$/i;

/** Parse "2026-03-14", "2026-03-14 01:05 PM" or "2026-03-14 13:05". Returns null if invalid. */
export function parseDateTime(input: string): DateTime | null {
  const m = DATE_TIME_RE.exec(input.trim());
  if (!m) return null;
  const [, y = "", mo = "", d = "", hh, mm, ampm] = m;
  if (!isValidDate(Number(y), Number(mo), Number(d))) return null;
  const result: DateTime = { date: `${y}-${mo}-${d}` };
  if (hh !== undefined && mm !== undefined) {
    const time = toTime(hh, mm, ampm);
    if (!time) return null;
    result.time = time;
  }
  return result;
}

/** "13", "05", "PM"? -> "13:05"; null if out of range. */
function toTime(hh: string, mm: string, ampm?: string): string | null {
  let hour = Number(hh);
  const minute = Number(mm);
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${mm}`;
}

const DAY_MONTH_YEAR_RE = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/;

/** Parse "9 Sep 2026" / "30 September 2026" into ISO "2026-09-09". Returns null if invalid. */
export function parseDayMonthYear(input: string): string | null {
  const m = DAY_MONTH_YEAR_RE.exec(input.trim());
  if (!m) return null;
  const [, d = "", mon = "", y = ""] = m;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === mon.toLowerCase()) + 1;
  if (!month || !isValidDate(Number(y), month, Number(d))) return null;
  return `${y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const MONTH_DAY_YEAR_RE = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/;

/** Parse "Oct 9, 2026" / "October 13, 2026" into ISO "2026-10-09". Returns null if invalid. */
export function parseMonthDayYear(input: string): string | null {
  const m = MONTH_DAY_YEAR_RE.exec(input.trim());
  if (!m) return null;
  const [, mon = "", d = "", y = ""] = m;
  return parseDayMonthYear(`${d} ${mon} ${y}`);
}

const CLOCK_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i;

/** Parse "10:12:13 PM" / "08:05 AM" / "22:12" into 24-hour "22:12". Returns null if invalid. */
export function parseClockTime(input: string): string | null {
  const m = CLOCK_RE.exec(input.trim());
  if (!m) return null;
  const [, hh = "", mm = "", ampm] = m;
  return toTime(hh, mm, ampm);
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-21", "2026-10-18" -> "Sep 21 – Oct 18, 2026" (year shown once when it's the same). */
export function formatPeriod(start: string, end: string): string {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return { y: y ?? 0, m: MONTHS[(m ?? 1) - 1] ?? "", d: d ?? 0 };
  };
  const a = parse(start);
  const b = parse(end);
  if (start === end) return `${a.m} ${a.d}, ${a.y}`;
  return a.y === b.y
    ? `${a.m} ${a.d} – ${b.m} ${b.d}, ${b.y}`
    : `${a.m} ${a.d}, ${a.y} – ${b.m} ${b.d}, ${b.y}`;
}
