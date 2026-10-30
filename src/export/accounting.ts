// Import files for accounting software. Each takes the rows of ONE account (accounting tools import
// a statement into one bank account at a time). Amounts are plain numbers ("-1234.56"); rows
// without an amount (flagged ones the reader couldn't place) are left out, since importers reject
// or misread blank amounts.
//
// Formats:
// - QuickBooks Online: the 3-column bank CSV (Date, Description, Amount; payments negative), as in
//   Intuit's "Format CSV files in Excel to get bank transactions into QuickBooks" help article.
// - Xero: one signed amount plus Payee, Description and Reference (Xero maps columns on import).
// - OFX 1.0.2 (SGML): the bank file most accounting and finance apps import.
// Test an import in each product before claiming support for it anywhere on the site.
import { accountKey } from "../lib/combine.ts";
import { csvText } from "./toCsv.ts";
import type { ParseResult, Transaction, Workbook } from "../parsers/types.ts";

export type DateOrder = "mdy" | "dmy";

export interface AccountExport {
  transactions: Transaction[];
  /** e.g. "GCash" (used for the OFX bank id) */
  bankName: string;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  /** centavos: the statement's ending balance, if printed */
  closingBalance?: number;
}

const hasAmount = (t: Transaction) => t.debit > 0 || t.credit > 0;
/** centavos -> "-1234.56" (credit positive, debit negative) */
const signedAmount = (t: Transaction) => {
  const c = t.credit - t.debit;
  return `${c < 0 ? "-" : ""}${(Math.abs(c) / 100).toFixed(2)}`;
};

/** ISO "2026-03-14" -> "03/14/2026" (mdy) or "14/03/2026" (dmy). */
export function formatDate(iso: string, order: DateOrder): string {
  const [y = "", m = "", d = ""] = iso.split("-");
  return order === "mdy" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

const lines = (rows: string[][]) => rows.map((r) => r.join(",")).join("\r\n") + "\r\n";

/** QuickBooks Online 3-column bank CSV. */
export function toQuickBooksCsv(account: AccountExport, order: DateOrder): string {
  const rows = [["Date", "Description", "Amount"]];
  for (const t of account.transactions.filter(hasAmount)) {
    rows.push([formatDate(t.date, order), csvText(t.description), signedAmount(t)]);
  }
  return lines(rows);
}

/** Xero bank statement CSV: Date, Amount, Payee, Description, Reference. */
export function toXeroCsv(account: AccountExport, order: DateOrder): string {
  const rows = [["Date", "Amount", "Payee", "Description", "Reference"]];
  for (const t of account.transactions.filter(hasAmount)) {
    rows.push([
      formatDate(t.date, order),
      signedAmount(t),
      csvText(t.description),
      csvText(t.category ?? ""),
      csvText(t.referenceNo ?? ""),
    ]);
  }
  return lines(rows);
}

// ---- OFX -----------------------------------------------------------------------

/** OFX 1.0.2 files are declared US-ASCII: drop accents ("ñ" -> "n"), replace other symbols. */
function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/₱/g, "PHP ")
    .replace(/[^\x20-\x7e]/g, "?");
}
/** SGML value: ASCII, escaped, trimmed to the field's maximum length. */
const value = (s: string, max: number) =>
  ascii(s).slice(0, max).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

const ofxDate = (iso: string, time?: string) =>
  iso.replace(/-/g, "") + (time ? `${time.replace(":", "")}00` : "");

/** FNV-1a (32-bit) as hex: a short, stable id from text. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Stable, unique transaction ids: the same statement exported twice gives the same ids, so
 * importers can recognise rows they already have. Reference numbers alone aren't enough (some
 * banks print transaction-type codes that repeat), so every printed field goes into the id, plus a
 * counter for identical rows.
 */
function fitIds(account: AccountExport, txs: Transaction[]): string[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const key = [
      account.bankName,
      account.accountNumber ?? "",
      t.date,
      t.time ?? "",
      t.description,
      t.referenceNo ?? "",
      t.debit,
      t.credit,
      t.balance ?? "",
    ].join("|");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${hash(key)}${hash(`${key}|${n}`)}`;
  });
}

/** OFX 1.0.2 bank statement. `now` is injectable for tests (DTSERVER). */
export function toOfx(account: AccountExport, now: Date = new Date()): string {
  const txs = account.transactions.filter(hasAmount);
  const ids = fitIds(account, txs);
  const dates = txs
    .map((t) => t.date)
    .filter(Boolean)
    .sort();
  const start = account.periodStart ?? dates[0] ?? "";
  const end = account.periodEnd ?? dates[dates.length - 1] ?? "";
  const server = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const accountId = (account.accountNumber ?? "").replace(/[^0-9A-Za-z]/g, "") || "0000";
  // The ending balance as printed, else the last row's balance. Never invent one: OFX importers show
  // it as the account balance, so it's left out when the statement doesn't print any.
  const lastBalance = [...txs].reverse().find((t) => t.balance !== undefined)?.balance;
  const balance = account.closingBalance ?? lastBalance;

  const out = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<SIGNONMSGSRSV1><SONRS>",
    "<STATUS><CODE>0<SEVERITY>INFO</STATUS>",
    `<DTSERVER>${server}`,
    "<LANGUAGE>ENG",
    "</SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS>",
    "<TRNUID>1",
    "<STATUS><CODE>0<SEVERITY>INFO</STATUS>",
    "<STMTRS>",
    "<CURDEF>PHP",
    "<BANKACCTFROM>",
    `<BANKID>${value(account.bankName.toUpperCase(), 9) || "BANK"}`,
    `<ACCTID>${value(accountId, 22)}`,
    "<ACCTTYPE>CHECKING",
    "</BANKACCTFROM>",
    "<BANKTRANLIST>",
    `<DTSTART>${ofxDate(start)}`,
    `<DTEND>${ofxDate(end)}`,
  ];
  txs.forEach((t, i) => {
    out.push(
      "<STMTTRN>",
      `<TRNTYPE>${t.credit > t.debit ? "CREDIT" : "DEBIT"}`,
      `<DTPOSTED>${ofxDate(t.date, t.time)}`,
      `<TRNAMT>${signedAmount(t)}`,
      `<FITID>${ids[i]}`,
    );
    // OFX element order: ... FITID, REFNUM, NAME, MEMO.
    if (t.referenceNo) out.push(`<REFNUM>${value(t.referenceNo, 32)}`);
    out.push(`<NAME>${value(t.description, 32) || "Transaction"}`);
    if (t.description.length > 32) out.push(`<MEMO>${value(t.description, 255)}`);
    out.push("</STMTTRN>");
  });
  out.push("</BANKTRANLIST>");
  if (balance !== undefined) {
    out.push(
      "<LEDGERBAL>",
      `<BALAMT>${balance < 0 ? "-" : ""}${(Math.abs(balance) / 100).toFixed(2)}`,
      `<DTASOF>${ofxDate(end)}`,
      "</LEDGERBAL>",
    );
  }
  out.push("</STMTRS>", "</STMTTRNRS></BANKMSGSRSV1>", "</OFX>");
  return out.join("\r\n") + "\r\n";
}

export interface AccountChoice {
  /** shown in the account picker, e.g. "GCash · Mar 1 – Apr 15, 2026" */
  label: string;
  /** for file names, e.g. "gcash" */
  slug: string;
  account: AccountExport;
}

/**
 * Split a (combined) result into its accounts: statements of the same account are exported
 * together, different accounts separately. `sourceName` turns "gcash" into "GCash".
 */
export function accountChoices(
  result: ParseResult,
  sourceName: (source: ParseResult["source"]) => string,
): AccountChoice[] {
  const statements = "statements" in result ? (result as Workbook).statements : [];
  if (statements.length < 2) {
    return [
      {
        label: sourceName(result.source),
        slug: result.source,
        account: {
          transactions: result.transactions,
          bankName: sourceName(result.source),
          accountNumber: result.accountNumber,
          periodStart: result.periodStart,
          periodEnd: result.periodEnd,
          closingBalance: result.closingBalance,
        },
      },
    ];
  }
  const groups = new Map<string, number[]>();
  statements.forEach((st, i) => {
    const key = accountKey(st.result);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  return [...groups.values()].map((indices) => {
    const members = indices.map((i) => statements[i]!.result);
    const first = members[0]!;
    const last = members[members.length - 1]!;
    const starts = members
      .map((m) => m.periodStart)
      .filter((d): d is string => Boolean(d))
      .sort();
    const ends = members
      .map((m) => m.periodEnd)
      .filter((d): d is string => Boolean(d))
      .sort();
    const name = sourceName(first.source);
    const masked = first.accountNumber
      ? ` ····${first.accountNumber.replace(/\D/g, "").slice(-4)}`
      : "";
    const span =
      indices.length === 1
        ? statements[indices[0]!]!.label
        : `${name}${masked} · ${indices.length} statements`;
    return {
      label: span,
      slug: first.source === "generic" ? "bank" : first.source,
      account: {
        transactions: result.transactions.filter((t) => indices.includes(t.statement ?? 0)),
        bankName: name,
        accountNumber: first.accountNumber,
        periodStart: starts[0],
        periodEnd: ends[ends.length - 1],
        closingBalance: last.closingBalance,
      },
    };
  });
}
