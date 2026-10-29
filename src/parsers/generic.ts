import { groupRows, type Row } from "../pdf/pageText.ts";
import { parseClockTime } from "../lib/dates.ts";
import { formatMoney } from "../lib/money.ts";
import { unspace } from "./bpi.ts";
import { reconcile, type StatementSummary } from "./reconcile.ts";
import type { PageText, ParseResult, StatementParser, TextItem, Transaction } from "./types.ts";

/*
 * General reader (beta): for statements no bank-specific parser recognises. Instead of one known
 * layout it looks for a transaction table by its column names, then reads rows the same way the
 * bank parsers do (rows by y, columns by x, wrapped lines joined). It only accepts peso amounts with
 * centavos ("1,234.56", "-₱1,234.56", "(1,234.56)", "1,234.56 DR"), so a statement in another
 * currency isn't silently read as pesos.
 *
 * It never guesses quietly: ambiguous dates, unknown money direction and unread lines become
 * warnings or row flags, and the shared reconciliation decides how far the result can be trusted.
 */

type Role = "date" | "description" | "reference" | "debit" | "credit" | "amount" | "balance";
type ColumnRole = Role | "other";

/** Lowercase words only: "Ref. No." -> "ref no", "Date & Time" -> "date and time". */
export function normLabel(s: string): string {
  return unspace(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(in )?(php|peso|pesos)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYMS: Record<Role, string[]> = {
  date: [
    "date",
    "transaction date",
    "txn date",
    "trans date",
    "tran date",
    "posting date",
    "post date",
    "posted date",
    "date posted",
    "value date",
    "date and time",
    "date time",
  ],
  description: [
    "description",
    "details",
    "transaction details",
    "transaction description",
    "particulars",
    "narration",
    "narrative",
    "remarks",
    "transaction",
    "transactions",
    "memo",
    "payee",
    "transaction type and details",
  ],
  reference: [
    "reference",
    "reference no",
    "reference number",
    "reference id",
    "ref",
    "ref no",
    "ref number",
    "check no",
    "cheque no",
    "check number",
    "chq no",
    "transaction id",
    "trace no",
  ],
  debit: [
    "debit",
    "debits",
    "debit amount",
    "withdrawal",
    "withdrawals",
    "withdrawal amount",
    "money out",
    "paid out",
    "amount debited",
    "outflow",
    "dr",
  ],
  credit: [
    "credit",
    "credits",
    "credit amount",
    "deposit",
    "deposits",
    "deposit amount",
    "money in",
    "paid in",
    "amount credited",
    "inflow",
    "cr",
  ],
  amount: ["amount", "transaction amount", "amt"],
  balance: ["balance", "running balance", "ledger balance", "daily balance", "end balance"],
};

const ROLE_BY_LABEL = new Map<string, Role>();
/** Same labels without spaces, for letter-spaced PDFs where word gaps are lost ("DEBITAMOUNT"). */
const ROLE_BY_COMPACT = new Map<string, Role>();
for (const [role, labels] of Object.entries(SYNONYMS) as [Role, string[]][]) {
  for (const label of labels) {
    ROLE_BY_LABEL.set(normLabel(label), role);
    ROLE_BY_COMPACT.set(normLabel(label).replace(/ /g, ""), role);
  }
}
const roleOf = (text: string) =>
  ROLE_BY_LABEL.get(normLabel(text)) ?? ROLE_BY_COMPACT.get(normLabel(text).replace(/ /g, ""));

const AMOUNT_ROLES: ReadonlySet<ColumnRole> = new Set(["debit", "credit", "amount", "balance"]);

interface Column {
  role: ColumnRole;
  label: string;
  x: number;
  right: number;
}

interface Layout {
  columns: Column[];
  hasBalance: boolean;
  /** "amount": one column, direction from signs or balances; "split": separate debit/credit. */
  mode: "split" | "amount";
}

interface Header {
  layout: Layout;
  /** y of the header's last line; the table starts below it */
  bottom: number;
  top: number;
}

// ---- money ---------------------------------------------------------------------

export interface Amount {
  /** centavos, >= 0 */
  value: number;
  /** -1: marked as money out (minus, brackets, DR); 1: marked as money in (+, CR); 0: unmarked */
  sign: -1 | 0 | 1;
}

const AMOUNT_RE =
  /^([+\-−–])?\s*(\()?\s*(?:₱|PHP)?\s*([+\-−–])?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\s*(\))?\s*(-|\+|DR|CR)?$/i;

/** Peso amounts with centavos only, so reference numbers and other currencies aren't read. */
export function parseAmount(input: string): Amount | null {
  const m = AMOUNT_RE.exec(input.trim());
  if (!m) return null;
  const [, lead, open, inner, whole = "", cents = "", close, trail] = m;
  if (Boolean(open) !== Boolean(close)) return null;
  const value = Number(whole.replace(/,/g, "")) * 100 + Number(cents);
  if (!Number.isSafeInteger(value)) return null;
  const minus = (s?: string) => s !== undefined && /[-−–]/.test(s);
  const t = trail?.toUpperCase();
  const negative = minus(lead) || minus(inner) || Boolean(open) || t === "-" || t === "DR";
  const positive = lead === "+" || inner === "+" || t === "+" || t === "CR";
  if (negative && positive) return null;
  return { value, sign: negative ? -1 : positive ? 1 : 0 };
}

// ---- dates -----------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FULL_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthNumber(name: string): number | null {
  const n = name.toLowerCase().replace(/\.$/, "");
  if (n.length < 3) return null;
  const i = MONTHS.indexOf(n.slice(0, 3));
  if (i < 0) return null;
  return FULL_MONTHS[i]?.startsWith(n) || n === "sept" ? i + 1 : null;
}

/** A date as printed, before we know the statement's day/month order or (sometimes) its year. */
export type DateToken =
  | { kind: "full"; y: number; m: number; d: number }
  /** "03/04/2026": day/month or month/day, decided per statement */
  | { kind: "numeric"; a: number; b: number; y?: number }
  | { kind: "noYear"; m: number; d: number };

const yearOf = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

const TIME_SUFFIX_RE = /\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)$/i;

/** Parse a printed date (optionally followed by a time). Returns null when it isn't one. */
export function parseDateToken(input: string): { token: DateToken; time?: string } | null {
  let s = input.trim().replace(/\s+/g, " ");
  let time: string | undefined;
  const t = TIME_SUFFIX_RE.exec(s);
  if (t) {
    time = parseClockTime(t[1] ?? "") ?? undefined;
    if (!time) return null;
    s = s.slice(0, t.index).trim();
  }
  const token = dateToken(s);
  if (!token) return null;
  return time ? { token, time } : { token };
}

function dateToken(s: string): DateToken | null {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return full(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return numeric(Number(m[1]), Number(m[2]), yearOf(m[3] ?? ""));
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return numeric(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[ -]([A-Za-z]{3,9}\.?)(?:,?[ -](\d{2}|\d{4}))?$/.exec(s);
  if (m) return named(m[2] ?? "", Number(m[1]), m[3]);
  m = /^([A-Za-z]{3,9}\.?)[ -](\d{1,2})(?:,?[ -](\d{2}|\d{4}))?$/.exec(s);
  if (m) return named(m[1] ?? "", Number(m[2]), m[3]);
  return null;
}

function valid(y: number, m: number, d: number) {
  if (y < 1990 || y > 2099 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function full(y: number, m: number, d: number): DateToken | null {
  return valid(y, m, d) ? { kind: "full", y, m, d } : null;
}

function numeric(a: number, b: number, y?: number): DateToken | null {
  const year = y ?? 2000; // leap-year friendly placeholder for the validity check
  if (!valid(year, a, b) && !valid(year, b, a)) return null;
  return y === undefined ? { kind: "numeric", a, b } : { kind: "numeric", a, b, y };
}

function named(month: string, d: number, y?: string): DateToken | null {
  const m = monthNumber(month);
  if (!m) return null;
  if (y === undefined) return valid(2000, m, d) ? { kind: "noYear", m, d } : null;
  return full(yearOf(y), m, d);
}

type Order = "mdy" | "dmy";

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** ISO date for a token; `refEnd` supplies the year when the statement prints none. */
function resolveDate(token: DateToken, order: Order, refEnd?: string): string | null {
  let y: number | undefined;
  let m: number;
  let d: number;
  if (token.kind === "full") ({ y, m, d } = token);
  else if (token.kind === "noYear") ({ m, d } = token);
  else {
    [m, d] = order === "mdy" ? [token.a, token.b] : [token.b, token.a];
    y = token.y;
  }
  if (y === undefined) {
    if (!refEnd) return null;
    const [ey = 0, em = 0, ed = 0] = refEnd.split("-").map(Number);
    // The latest date on or before the reference end (Dec rows on a statement ending in Jan).
    y = m > em || (m === em && d > ed) ? ey - 1 : ey;
  }
  return valid(y, m, d) ? iso(y, m, d) : null;
}

/** Decide day/month order from the statement's numeric dates. */
function decideOrder(tokens: DateToken[]): { order: Order; warning?: string } {
  const nums = tokens.filter(
    (t): t is Extract<DateToken, { kind: "numeric" }> => t.kind === "numeric",
  );
  const firstOver12 = nums.some((t) => t.a > 12);
  const secondOver12 = nums.some((t) => t.b > 12);
  if (firstOver12 && !secondOver12) return { order: "dmy" };
  if (secondOver12 && !firstOver12) return { order: "mdy" };
  if (firstOver12 && secondOver12) {
    return {
      order: "mdy",
      warning: "Dates aren't printed in one format. Please compare them with your PDF.",
    };
  }
  const ambiguous = nums.some((t) => t.a !== t.b);
  if (!ambiguous) return { order: "mdy" };
  // Every date fits both ways: prefer the order that keeps the rows in date sequence.
  const inSequence = (order: Order) => {
    const ds = nums.map((t) => resolveDate(t, order, "2100-12-31") ?? "");
    const up = ds.every((d, i) => i === 0 || d >= (ds[i - 1] ?? ""));
    const down = ds.every((d, i) => i === 0 || d <= (ds[i - 1] ?? ""));
    return up || down;
  };
  const mdy = inSequence("mdy");
  const dmy = inSequence("dmy");
  if (dmy && !mdy) return { order: "dmy" };
  return {
    order: "mdy",
    warning: mdy
      ? "Dates like 03/04 could be month/day or day/month; we read them as month/day. Please check a few against your PDF."
      : "Dates aren't in order either way they're read. Please compare them with your PDF.",
  };
}

// ---- header ----------------------------------------------------------------------

interface Cell {
  text: string;
  x: number;
  right: number;
  top: number;
  bottom: number;
}

/** Group a header line's items (and an optional second line) into column labels by overlap. */
function headerCells(items: TextItem[]): Cell[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const cells: { items: TextItem[]; x: number; right: number }[] = [];
  for (const item of sorted) {
    const last = cells[cells.length - 1];
    if (last && item.x <= last.right + 4.5) {
      last.items.push(item);
      last.right = Math.max(last.right, item.x + item.width);
    } else {
      cells.push({ items: [item], x: item.x, right: item.x + item.width });
    }
  }
  return cells.map((c) => ({
    text: [...c.items]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((i) => unspace(i.str))
      .join(" "),
    x: c.x,
    right: c.right,
    top: Math.min(...c.items.map((i) => i.y)),
    bottom: Math.max(...c.items.map((i) => i.y)),
  }));
}

function layoutFrom(cells: Cell[]): Layout | null {
  const seen = new Set<Role>();
  const columns: Column[] = cells.map((c) => {
    const role = roleOf(c.text);
    const unique = role && !seen.has(role) ? role : undefined;
    if (unique) seen.add(unique);
    return { role: unique ?? "other", label: c.text, x: c.x, right: c.right };
  });
  const split = seen.has("debit") && seen.has("credit");
  if (!seen.has("date") || !seen.has("description") || !(split || seen.has("amount"))) return null;
  if (split) {
    // With separate debit/credit columns, an "Amount" column would be ambiguous: ignore it.
    for (const c of columns) if (c.role === "amount") c.role = "other";
  }
  return { columns, hasBalance: seen.has("balance"), mode: split ? "split" : "amount" };
}

const recognised = (l: Layout) => l.columns.filter((c) => c.role !== "other").length;

function findHeader(rows: Row[]): Header | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const one = layoutFrom(headerCells(row.items));
    // Two-line labels ("Transaction" over "Date"), with one-line labels centred between them.
    const window = rows.slice(i, i + 3).filter((r) => r.y - row.y <= 14);
    const last = window[window.length - 1] ?? row;
    const stacked =
      window.length > 1 ? layoutFrom(headerCells(window.flatMap((r) => r.items))) : null;
    if (stacked && (!one || recognised(stacked) > recognised(one))) {
      return { layout: stacked, top: row.y, bottom: last.y };
    }
    if (one) return { layout: one, top: row.y, bottom: row.y };
  }
  return null;
}

// ---- lines -----------------------------------------------------------------------

interface Money {
  role: ColumnRole;
  amount: Amount;
  text: string;
}

interface Line {
  page: number;
  y: number;
  /** text in the date column, e.g. "03/14/2026" or "2026-03-14 08:15" */
  dateText: string;
  description: string;
  reference: string;
  money: Money[];
  /** normalized words outside the amount columns (for summary labels like "Ending balance") */
  words: string;
  raw: string;
}

const PAGE_FOOTER_RE = /^page \d+( of \d+)?$/;

/**
 * Column for text by its left edge. Headers are often centred over their data, so a column starts
 * halfway between the previous header's end and its own start.
 */
function textColumn(item: TextItem, columns: Column[]): Column | undefined {
  let found = columns[0];
  columns.forEach((c, i) => {
    const prev = columns[i - 1];
    const start = prev ? Math.min(c.x - 4, (prev.right + c.x) / 2) : -Infinity;
    if (start <= item.x) found = c;
  });
  return found;
}

/** Amount column for a money item by its right edge or centre (amounts are usually right-aligned). */
function amountColumn(x: number, right: number, columns: Column[]): Column | null {
  let best: Column | null = null;
  let bestDistance = Infinity;
  for (const c of columns) {
    if (!AMOUNT_ROLES.has(c.role)) continue;
    const distance = Math.min(
      Math.abs(right - c.right),
      Math.abs((x + right) / 2 - (c.x + c.right) / 2),
    );
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best && bestDistance <= 45 ? best : null;
}

/** Glue amount markers printed as their own item ("1,234.56" "DR", "PHP" "1,234.56"). */
function mergeMarkers(items: TextItem[]): TextItem[] {
  const out: TextItem[] = [];
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    const str = unspace(item.str);
    const prev = out[out.length - 1];
    const gap = prev ? item.x - (prev.x + prev.width) : Infinity;
    if (prev && gap < 10 && /^(DR|CR|-|\+)$/i.test(str) && parseAmount(prev.str)) {
      out[out.length - 1] = {
        ...prev,
        str: `${prev.str} ${str}`,
        width: item.x + item.width - prev.x,
      };
    } else if (
      prev &&
      gap < 10 &&
      /^(PHP|₱|-PHP|-₱)$/i.test(unspace(prev.str)) &&
      parseAmount(str)
    ) {
      out[out.length - 1] = {
        ...item,
        str: `${unspace(prev.str)}${str}`,
        x: prev.x,
        width: item.x + item.width - prev.x,
      };
    } else {
      out.push({ ...item, str });
    }
  }
  return out;
}

/** A whole date, a time, or a piece of one ("May", "15", "2026", "PM") printed as its own item. */
function dateLike(str: string): boolean {
  const s = str.trim();
  return (
    parseDateToken(s) !== null ||
    parseClockTime(s) !== null ||
    /^\d{1,2},?$/.test(s) ||
    /^(19|20)\d{2}$/.test(s) ||
    /^(AM|PM)$/i.test(s) ||
    monthNumber(s) !== null
  );
}

function readLine(row: Row, page: number, layout: Layout): Line {
  const parts: Record<"date" | "description" | "reference", string[]> = {
    date: [],
    description: [],
    reference: [],
  };
  const money: Money[] = [];
  const words: string[] = [];
  const items = mergeMarkers(row.items);
  for (const item of items) {
    const col = textColumn(item, layout.columns);
    const amount = col?.role === "date" ? null : parseAmount(item.str);
    const amountCol = amount ? amountColumn(item.x, item.x + item.width, layout.columns) : null;
    if (amount && amountCol) {
      money.push({ role: amountCol.role, amount, text: item.str });
      continue;
    }
    if (col && AMOUNT_ROLES.has(col.role) && /^(-|—|–|0\.00|nil)$/i.test(item.str.trim())) continue;
    // Only date-like text counts as the date; a description that starts under a centred
    // "Description" header (left of it) or a "Beginning balance" label stays text.
    const isDate = col?.role === "date" && dateLike(item.str);
    if (isDate) parts.date.push(item.str);
    else if (col?.role === "reference") parts.reference.push(item.str);
    else parts.description.push(item.str); // description and any unrecognised column
    if (!isDate) words.push(item.str);
  }
  return {
    page,
    y: row.y,
    dateText: parts.date.join(" ").trim(),
    description: parts.description.join(" ").replace(/\s+/g, " ").trim(),
    reference: parts.reference.join(" ").trim(),
    money,
    words: normLabel(words.join(" ")),
    raw: items.map((i) => i.str.trim()).join(" | "),
  };
}

// ---- summary labels --------------------------------------------------------------

const OPENING = [
  "opening balance",
  "beginning balance",
  "starting balance",
  "previous balance",
  "balance forward",
  "balance brought forward",
  "brought forward",
  "balance b f",
];
const CLOSING = [
  "closing balance",
  "ending balance",
  "new balance",
  "balance this statement",
  "balance carried forward",
  "carried forward",
  "balance c f",
];
const TOTAL_DEBIT = [
  "total outgoing",
  "total debit",
  "total debits",
  "total withdrawals",
  "total withdrawal",
  "total money out",
];
const TOTAL_CREDIT = [
  "total incoming",
  "total credit",
  "total credits",
  "total deposits",
  "total deposit",
  "total money in",
];

// Letter-spaced PDFs lose word gaps ("BEGINNINGBALANCE"), so also compare without spaces.
const compact = (s: string) => s.replace(/ /g, "");
const startsWithAny = (words: string, labels: string[]) =>
  labels.some(
    (l) =>
      words === l ||
      words.startsWith(`${l} `) ||
      (!words.includes(" ") && compact(words).startsWith(compact(l))),
  );
const containsAny = (words: string, labels: string[]) =>
  labels.some(
    (l) =>
      ` ${words} `.includes(` ${l} `) ||
      (!words.includes(" ") && compact(words).includes(compact(l))),
  );

type SummaryKind = "opening" | "closing" | "total";

function summaryKind(words: string): SummaryKind | null {
  if (startsWithAny(words, OPENING)) return "opening";
  if (startsWithAny(words, CLOSING)) return "closing";
  if (
    words === "total" ||
    words.startsWith("total ") ||
    containsAny(words, [...TOTAL_DEBIT, ...TOTAL_CREDIT])
  ) {
    return "total";
  }
  return null;
}

const signed = (a: Amount) => (a.sign < 0 ? -a.value : a.value);

function readSummaryLine(line: Line, kind: SummaryKind, summary: StatementSummary) {
  const byRole = (role: ColumnRole) => line.money.find((m) => m.role === role)?.amount;
  const last = line.money[line.money.length - 1]?.amount;
  if (kind === "opening" || kind === "closing") {
    const value = byRole("balance") ?? last;
    if (value) summary[kind] ??= signed(value);
    return;
  }
  const debit = byRole("debit");
  const credit = byRole("credit");
  if (debit) summary.totalDebit ??= debit.value;
  if (credit) summary.totalCredit ??= credit.value;
  if (!debit && !credit && last) {
    if (containsAny(line.words, TOTAL_DEBIT)) summary.totalDebit ??= last.value;
    else if (containsAny(line.words, TOTAL_CREDIT)) summary.totalCredit ??= last.value;
  }
}

/** Summary figures printed outside the table (an account summary box above it). */
function readSummaryRows(rows: Row[], summary: StatementSummary) {
  readStackedSummary(rows, summary);
  for (const row of rows) {
    const items = mergeMarkers(row.items);
    const amounts = items.map((i) => parseAmount(i.str)).filter((a): a is Amount => a !== null);
    const last = amounts[amounts.length - 1];
    if (!last) continue;
    const words = normLabel(
      items
        .filter((i) => !parseAmount(i.str))
        .map((i) => i.str)
        .join(" "),
    );
    if (containsAny(words, OPENING)) summary.opening ??= signed(last);
    else if (containsAny(words, CLOSING)) summary.closing ??= signed(last);
    else if (containsAny(words, TOTAL_DEBIT)) summary.totalDebit ??= last.value;
    else if (containsAny(words, TOTAL_CREDIT)) summary.totalCredit ??= last.value;
  }
}

/** Labels on one row with their amounts on the next ("Starting balance" above "PHP 5,000.00"). */
function readStackedSummary(rows: Row[], summary: StatementSummary) {
  rows.forEach((row, i) => {
    const next = rows[i + 1];
    if (!next || next.y - row.y > 45 || row.items.some((it) => parseAmount(unspace(it.str))))
      return;
    const amounts = mergeMarkers(next.items)
      .map((it) => ({ it, a: parseAmount(it.str) }))
      .filter((x): x is { it: TextItem; a: Amount } => x.a !== null);
    if (amounts.length < 2) return;
    for (const cell of headerCells(row.items)) {
      const centre = (cell.x + cell.right) / 2;
      const near = amounts
        .map((x) => ({ ...x, d: Math.abs(x.it.x + x.it.width / 2 - centre) }))
        .sort((p, q) => p.d - q.d)[0];
      if (!near || near.d > 60) continue;
      const words = normLabel(cell.text);
      if (containsAny(words, OPENING)) summary.opening ??= signed(near.a);
      else if (containsAny(words, CLOSING)) summary.closing ??= signed(near.a);
      else if (containsAny(words, TOTAL_DEBIT)) summary.totalDebit ??= near.a.value;
      else if (containsAny(words, TOTAL_CREDIT)) summary.totalCredit ??= near.a.value;
    }
  });
}

// ---- period ----------------------------------------------------------------------

const DATE_IN_TEXT_RE =
  /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b[A-Za-z]{3,9}\.? \d{1,2},? \d{4}\b|\b\d{1,2}[ -][A-Za-z]{3,9}\.?[ -]\d{4}\b/g;

const COMPACT_DATE_RE =
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*?(\d{1,2}),(\d{4})/gi;

/** Rows like "Statement Period: 03/01/2026 - 03/31/2026" or "From Mar 1, 2026 to Mar 31, 2026". */
function periodTokens(rows: Row[]): [DateToken, DateToken] | null {
  for (const row of rows) {
    const text = row.items.map((i) => unspace(i.str)).join(" ");
    const tokens = (text.match(DATE_IN_TEXT_RE) ?? [])
      .map((s) => dateToken(s.trim()))
      .filter((t): t is DateToken => t !== null);
    if (tokens.length === 2 && /period|from|covered|coverage|statement|to|[-–]/i.test(text)) {
      return [tokens[0] as DateToken, tokens[1] as DateToken];
    }
    // Letter-spaced text loses its word gaps: "PERIODCOVEREDMAY13,2026-AUG13,2026".
    const compact = [...text.replace(/\s+/g, "").matchAll(COMPACT_DATE_RE)]
      .map((m) => named(m[1] ?? "", Number(m[2]), m[3]))
      .filter((t): t is DateToken => t !== null);
    if (compact.length === 2 && /period|from|covered|coverage/i.test(text.replace(/\s+/g, ""))) {
      return [compact[0] as DateToken, compact[1] as DateToken];
    }
  }
  return null;
}

// ---- parse -----------------------------------------------------------------------

interface Draft {
  line: Line;
  token: DateToken | null;
  /** date shown once per day: inherits the previous row's date */
  sameDayAs?: Draft;
  time?: string;
  description: string[];
  reference: string[];
  money: Money[];
  raw: string[];
  lastY: number;
  page: number;
}

/** Lines of one transaction are at most this far apart (pt). */
const MAX_WRAP_GAP = 16;

export const GENERIC_NOTICE =
  "Read with the general reader (beta): this bank's layout isn't one we've checked yet, so please compare a few rows with your PDF.";

function parse(pages: PageText[]): ParseResult {
  const result: ParseResult = {
    source: "generic",
    transactions: [],
    warnings: [GENERIC_NOTICE],
    checks: { totalsMatchStatement: null, runningBalanceOk: null, openingToClosingOk: null },
  };
  const summary: StatementSummary = {};
  const outside: Row[] = [];
  const lines: Line[] = [];
  let layout: Layout | null = null;

  for (const page of pages) {
    // 3pt: a row's date can sit a little lower than its amounts (vertically centred cells).
    const rows = groupRows(page.items, 3);
    const header = findHeader(rows);
    if (header) layout = header.layout;
    if (!layout) {
      outside.push(...rows);
      continue;
    }
    if (header) outside.push(...rows.filter((r) => r.y < header.top - 1));
    const body = header ? rows.filter((r) => r.y > header.bottom + 1) : rows;
    for (const row of body) lines.push(readLine(row, page.pageNumber, layout));
  }
  if (!layout) {
    result.warnings.push("No transaction table header found.");
    return result;
  }
  const current = layout;

  // Group lines into transactions.
  const drafts: Draft[] = [];
  let open: Draft | null = null;
  let tableEnded = false;
  /** A dateless line closer to the next date line than to the previous row (vertically centred). */
  let carry: Line[] = [];
  lines.forEach((line, i) => {
    if (PAGE_FOOTER_RE.test(normLabel(line.raw.replace(/\|/g, " ")))) return;
    const kind = summaryKind(line.words);
    const entryMoney = line.money.some((m) => m.role !== "balance");
    if (kind && (kind === "total" || !entryMoney)) {
      readSummaryLine(line, kind, summary);
      if (kind !== "opening") tableEnded = true;
      open = null;
      carry = [];
      return;
    }
    const date = line.dateText ? parseDateToken(line.dateText) : null;
    if (date) {
      tableEnded = false;
      const above = carry.filter((c) => c.page === line.page);
      carry = [];
      open = {
        line,
        token: date.token,
        time: date.time,
        description: [...above.map((c) => c.description), line.description].filter(Boolean),
        reference: [...above.map((c) => c.reference), line.reference].filter(Boolean),
        money: [...line.money],
        raw: [...above.map((c) => c.raw), line.raw],
        lastY: line.y,
        page: line.page,
      };
      drafts.push(open);
      return;
    }
    if (tableEnded) return;
    const next = lines[i + 1];
    const nextIsDate =
      next?.page === line.page && Boolean(next.dateText && parseDateToken(next.dateText));
    if (!entryMoney && !line.dateText && nextIsDate && next) {
      const toNext = next.y - line.y;
      const toPrev = open && open.page === line.page ? line.y - open.lastY : Infinity;
      if (toNext < toPrev && toNext <= MAX_WRAP_GAP) {
        carry.push(line);
        return;
      }
    }
    const near = open && open.page === line.page && line.y - open.lastY <= MAX_WRAP_GAP;
    if (entryMoney && line.description && drafts.length) {
      // Date printed once per day: a dateless row with its own amount is another transaction.
      const prev = drafts[drafts.length - 1] as Draft;
      open = {
        line,
        token: null,
        sameDayAs: prev.sameDayAs ?? prev,
        description: [line.description],
        reference: line.reference ? [line.reference] : [],
        money: [...line.money],
        raw: [line.raw],
        lastY: line.y,
        page: line.page,
      };
      drafts.push(open);
      return;
    }
    if (open && near && !entryMoney) {
      const time = line.dateText ? parseClockTime(line.dateText) : null;
      if (time && !open.time) open.time = time;
      else if (line.dateText) open.description.push(line.dateText);
      if (line.description) open.description.push(line.description);
      if (line.reference) open.reference.push(line.reference);
      open.money.push(...line.money); // a balance printed on the wrapped line
      open.raw.push(line.raw);
      open.lastY = line.y;
      return;
    }
    open = null;
    if (line.money.length) {
      result.warnings.push(
        `Page ${line.page}: couldn't read a line with an amount: "${line.raw}".`,
      );
    }
  });
  readSummaryRows(outside, summary);

  // Dates: decide day/month order and the year for dates printed without one.
  const period = periodTokens(outside);
  const tokens = [
    ...drafts.map((d) => d.token).filter((t): t is DateToken => t !== null),
    ...(period ?? []),
  ];
  const { order, warning } = decideOrder(tokens);
  if (warning) result.warnings.push(warning);
  if (period) {
    const [start, end] = period.map((t) => resolveDate(t, order));
    if (start && end && start <= end) {
      result.periodStart = start;
      result.periodEnd = end;
    }
  }
  const hasYear = (t: DateToken) =>
    t.kind === "full" || (t.kind === "numeric" && t.y !== undefined);
  const latestFull = drafts
    .map((d) => (d.token && hasYear(d.token) ? resolveDate(d.token, order) : null))
    .filter((d): d is string => d !== null)
    .sort()
    .pop();
  const refEnd = result.periodEnd ?? latestFull;

  let txs = drafts.map((d) => buildTransaction(d, current, order, refEnd));
  // Newest first? Show oldest first, like every other statement.
  const dated = txs.map((t) => t.date).filter(Boolean);
  const first = dated[0] ?? "";
  const last = dated[dated.length - 1] ?? "";
  if (first > last && dated.every((d, i) => i === 0 || d <= (dated[i - 1] ?? ""))) {
    txs = txs.reverse();
  }
  if (dated.some((d, i) => i > 0 && d < (dated[i - 1] ?? "")) && !(first > last)) {
    result.warnings.push("Rows aren't in date order. Please compare with your PDF.");
  }

  if (current.mode === "amount") assignDirections(txs, summary.opening, result.warnings);

  if (result.periodStart && result.periodEnd) {
    const { periodStart: start, periodEnd: end } = result;
    for (const tx of txs) {
      if (tx.date && (tx.date < start || tx.date > end))
        addFlag(tx, "date outside the statement period");
    }
  }

  result.transactions = txs;
  result.openingBalance = summary.opening;
  result.closingBalance = summary.closing;
  if (summary.totalDebit !== undefined || summary.totalCredit !== undefined) {
    result.statementTotals = { debit: summary.totalDebit, credit: summary.totalCredit };
  }
  reconcile(result, summary, { printsBalances: current.hasBalance });
  return result;
}

/** Join wrapped lines; a word split after a hyphen ("sub-" / "AbCd1234") continues without a space. */
function joinWrapped(lines: string[]): string {
  return lines
    .reduce((acc, line) => (acc ? acc + (/\S-$/.test(acc) ? "" : " ") + line : line), "")
    .replace(/\s+/g, " ")
    .trim();
}

function addFlag(tx: Transaction, flag: string) {
  tx.flags = [...(tx.flags ?? []), flag];
}

/** Unsigned amounts in a single column: direction from the signs used elsewhere, or the balance. */
const UNSIGNED = Symbol("unsigned");
type Pending = Transaction & { [UNSIGNED]?: number };

function buildTransaction(d: Draft, layout: Layout, order: Order, refEnd?: string): Pending {
  const flags: string[] = [];
  let date = "";
  const token = d.token ?? d.sameDayAs?.token ?? null;
  if (token) {
    date = resolveDate(token, order, refEnd) ?? "";
    const noYear = token.kind === "noYear" || (token.kind === "numeric" && token.y === undefined);
    if (!date) flags.push(noYear ? "year not shown" : "unreadable date");
  }

  const of = (role: ColumnRole) => d.money.filter((m) => m.role === role);
  const tx: Pending = {
    date,
    description: joinWrapped(d.description),
    debit: 0,
    credit: 0,
    raw: d.raw.join(" / "),
  };
  if (d.time) tx.time = d.time;
  const reference = d.reference.reduce(
    (acc, r) => (acc ? acc + (acc.endsWith("-") ? "" : " ") + r : r),
    "",
  );
  if (reference) tx.referenceNo = reference;

  if (layout.mode === "split") {
    const debits = of("debit");
    const credits = of("credit");
    if (debits.length > 1 || credits.length > 1) flags.push("multiple amounts");
    tx.debit = debits[0]?.amount.value ?? 0;
    tx.credit = credits[0]?.amount.value ?? 0;
    if (tx.debit && tx.credit) flags.push("both a debit and a credit amount");
  } else {
    const amounts = of("amount");
    if (amounts.length > 1) flags.push("multiple amounts");
    const a = amounts[0]?.amount;
    if (a) {
      if (a.sign < 0) tx.debit = a.value;
      else if (a.sign > 0) tx.credit = a.value;
      else tx[UNSIGNED] = a.value;
    }
  }
  const hasAmount = tx.debit || tx.credit || tx[UNSIGNED] !== undefined;
  if (!hasAmount) flags.push("missing or unreadable amount");

  const balances = of("balance");
  if (balances.length > 1) flags.push("multiple balances");
  const balance = balances[0]?.amount;
  if (balance) tx.balance = signed(balance);
  if (!tx.description) flags.push("missing description");
  if (flags.length) tx.flags = flags;
  return tx;
}

function assignDirections(txs: Pending[], opening: number | undefined, warnings: string[]) {
  const marked = txs.filter((t) => t[UNSIGNED] === undefined && (t.debit || t.credit));
  const anyOut = marked.some((t) => t.debit);
  const anyIn = marked.some((t) => t.credit);
  let prev = opening;
  let unresolved = 0;
  for (const tx of txs) {
    const value = tx[UNSIGNED];
    if (value !== undefined) {
      delete tx[UNSIGNED];
      if (anyOut && !anyIn) tx.credit = value;
      else if (anyIn && !anyOut) tx.debit = value;
      else if (prev !== undefined && tx.balance !== undefined && tx.balance === prev - value)
        tx.debit = value;
      else if (prev !== undefined && tx.balance !== undefined && tx.balance === prev + value)
        tx.credit = value;
      else {
        unresolved++;
        addFlag(tx, `couldn't tell if ${formatMoney(value)} is money in or out`);
      }
    }
    prev = tx.balance ?? undefined;
  }
  if (unresolved) {
    warnings.push(
      `${unresolved} ${unresolved === 1 ? "amount isn't" : "amounts aren't"} marked as money in or out. Those rows are left at zero; please fill them in from your PDF.`,
    );
  }
}

export const genericParser: StatementParser = {
  id: "generic",
  label: "Bank statement (general reader, beta)",
  canParse: (pages) => parse(pages).transactions.some((t) => t.debit || t.credit),
  parse,
};
