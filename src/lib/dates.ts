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
    let hour = Number(hh);
    const minute = Number(mm);
    if (ampm) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0);
    }
    if (hour > 23 || minute > 59) return null;
    result.time = `${String(hour).padStart(2, "0")}:${mm}`;
  }
  return result;
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
