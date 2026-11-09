// Payment checker: a seller pastes the reference numbers (and/or amounts) customers sent as proof
// of payment, and each one is looked up in the statement(s) already read on this device.
// Pure functions only. It checks the statement, not GCash's system: "not found" means "not in this
// statement", never "fake". Nothing is stored or sent anywhere.
import type { Transaction } from "../parsers/types.ts";
import { parseMoney } from "./money.ts";

/** One pasted line, read into a reference number and/or an amount. */
export interface PaymentQuery {
  /** The line as pasted (trimmed). */
  line: string;
  /** Reference-number candidates found on the line, normalized (see normalizeRef). */
  refs: string[];
  /** Amount in centavos, when the line has one. */
  amount?: number;
}

export interface PaymentRow {
  /** 1-based position in the transactions list (same numbering as the table). */
  row: number;
  tx: Transaction;
}

export type PaymentStatus =
  /** Reference found as money in (and the amount matches, when one was given). */
  | "found"
  /** Reference found as money in, but for a different amount than the one pasted. */
  | "amountDiffers"
  /** Reference found, but it's money going out (or has no amount). */
  | "notIncoming"
  /** No reference given; money-in rows with exactly this amount (possible matches only). */
  | "amountOnly"
  /** Not in these statements. */
  | "notFound"
  /** Nothing usable on the line (no reference number or amount). */
  | "unreadable";

export interface PaymentCheck {
  query: PaymentQuery;
  status: PaymentStatus;
  /** The reference that was looked up (the one that matched, else the first candidate). */
  ref?: string;
  /** Matching rows: by reference, or for "amountOnly" the money-in rows with that amount. */
  matches: PaymentRow[];
  /** The matched row's balance didn't move as expected (see Transaction.balanceIssue). */
  balanceIssue: boolean;
}

/** Most lines a single check reads; more is almost certainly a paste of something else. */
export const MAX_LINES = 200;
/** Shortest reference number we accept (GCash prints 13 digits; banks' are shorter or alphanumeric). */
const MIN_REF = 8;

/** "1234 567 890123" / "ref-1234567890123" → "1234567890123"; letters are kept, upper-cased. */
export function normalizeRef(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Amounts: "₱1,500.00", "PHP 500", "1,500", "500.00". A bare number without ₱, comma or centavos is
// treated as an amount only when the line has nothing else (e.g. "500").
const AMOUNT_RE =
  /(?:₱|\bPHP\s?|\bP(?=\s?\d))\s?\d[\d,]*(?:\.\d{1,2})?|(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?(?![\d.,])|(?<![\d.,])\d+\.\d{2}(?![\d.,])/gi;
const CURRENCY_RE = /^(?:₱|PHP|P)/i;
// Digit groups separated by single spaces or dashes, as apps and receipts display them.
const DIGITS_RE = /\d(?:[ -]?\d)+/g;

/** Read one pasted line into a reference number and/or an amount. */
export function parsePaymentLine(input: string): PaymentQuery {
  const line = input.trim();
  let rest = line;
  let amount: number | undefined;
  // Prefer an amount marked with ₱/PHP over a plain "1,500.00" elsewhere on the line.
  const found = line.match(AMOUNT_RE) ?? [];
  const amountMatch = found.find((m) => CURRENCY_RE.test(m)) ?? found[0];
  if (amountMatch) {
    const centavos = parseMoney(amountMatch.replace(CURRENCY_RE, ""));
    if (centavos !== null && centavos > 0) {
      amount = centavos;
      rest = line.replace(amountMatch, " ");
    }
  }
  // "4000000000001 500" or a row pasted from a spreadsheet: a reference and a whole-peso amount.
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (amount === undefined && tokens.length === 2) {
    const [a = "", b = ""] = tokens;
    const short = /^\d{1,7}$/;
    const long = (s: string) => normalizeRef(s).length >= MIN_REF;
    const pair = short.test(b) && long(a) ? [a, b] : short.test(a) && long(b) ? [b, a] : null;
    if (pair) {
      return { line, refs: [normalizeRef(pair[0] ?? "")], amount: Number(pair[1]) * 100 };
    }
  }
  const refs: string[] = [];
  // Skip numbers that are only part of a reference already taken (the digits of "BDO0A12345678").
  const add = (ref: string) => {
    if (ref.length >= MIN_REF && !refs.some((r) => r.includes(ref))) refs.push(ref);
  };
  // Letters and digits mixed, e.g. bank references like "BDO-0A12345678".
  for (const token of tokens) {
    // "Ref:4000000000001" is a label stuck to a number, not a letters-and-digits reference.
    const ref = normalizeRef(token).replace(/^(?:REF(?:ERENCE)?(?:NO)?|NO|TXN|ID)/, "");
    if (/\d/.test(ref) && /[A-Z]/.test(ref)) add(ref);
  }
  for (const m of rest.match(DIGITS_RE) ?? []) add(normalizeRef(m));
  // Also each long number on its own, in case two were joined by a space.
  for (const token of tokens) if (/^\d+$/.test(token)) add(token);
  if (amount === undefined && refs.length === 0) {
    // Just a number, e.g. "500": an amount in pesos.
    const bare = /^\d{1,7}$/.exec(rest.trim().replace(/,/g, ""));
    if (bare) amount = Number(bare[0]) * 100;
  }
  return { line, refs, ...(amount !== undefined ? { amount } : {}) };
}

/** Split pasted text into lines worth checking (blank lines dropped, at most MAX_LINES). */
export function parsePaymentText(text: string): { queries: PaymentQuery[]; truncated: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    queries: lines.slice(0, MAX_LINES).map(parsePaymentLine),
    truncated: lines.length > MAX_LINES,
  };
}

/** Look up each pasted payment in the transactions. Never guesses: amount-only lines list candidates. */
export function checkPayments(txs: Transaction[], queries: PaymentQuery[]): PaymentCheck[] {
  const byRef = new Map<string, PaymentRow[]>();
  txs.forEach((tx, i) => {
    if (!tx.referenceNo) return;
    const key = normalizeRef(tx.referenceNo);
    if (!key) return;
    const list = byRef.get(key) ?? [];
    list.push({ row: i + 1, tx });
    byRef.set(key, list);
  });

  return queries.map((query): PaymentCheck => {
    const base = { query, matches: [] as PaymentRow[], balanceIssue: false };
    if (query.refs.length === 0) {
      if (query.amount === undefined) return { ...base, status: "unreadable" };
      const matches: PaymentRow[] = [];
      txs.forEach((tx, i) => {
        if (tx.credit === query.amount) matches.push({ row: i + 1, tx });
      });
      return {
        ...base,
        status: matches.length ? "amountOnly" : "notFound",
        matches,
        balanceIssue: matches.some((m) => m.tx.balanceIssue),
      };
    }
    // A pasted message can hold several numbers (a phone number, the reference): use the one
    // the statement has.
    const ref = query.refs.find((r) => byRef.has(r)) ?? query.refs[0];
    const matches = (ref && byRef.get(ref)) || [];
    if (!matches.length) return { ...base, ref, status: "notFound" };
    const incoming = matches.filter((m) => m.tx.credit > 0);
    const balanceIssue = matches.some((m) => m.tx.balanceIssue);
    if (!incoming.length) return { ...base, ref, matches, balanceIssue, status: "notIncoming" };
    const status =
      query.amount === undefined || incoming.some((m) => m.tx.credit === query.amount)
        ? "found"
        : "amountDiffers";
    return { ...base, ref, matches, balanceIssue, status };
  });
}

/** Counts per status, for the one-line summary above the results. */
export function paymentCounts(checks: PaymentCheck[]): Record<PaymentStatus, number> {
  const counts: Record<PaymentStatus, number> = {
    found: 0,
    amountDiffers: 0,
    notIncoming: 0,
    amountOnly: 0,
    notFound: 0,
    unreadable: 0,
  };
  for (const c of checks) counts[c.status]++;
  return counts;
}
