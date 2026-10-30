import { formatMoney } from "../lib/money.ts";
import { balanceCheckLabel, isCombined, notesLabel, statementsOf } from "../lib/summary.ts";
import type { ParseResult } from "../parsers/types.ts";

const HEADERS = [
  "Date",
  "Time",
  "Description",
  "Reference No.",
  "Debit",
  "Credit",
  "Balance",
  "Balance check",
  "Notes",
  "Category",
];

/** Plain number for spreadsheets: "1234.56" (no thousands separator so it parses as a number). */
const plain = (centavos: number | undefined) =>
  centavos === undefined ? "" : (centavos / 100).toFixed(2);

/**
 * Quote a text cell. Also neutralises spreadsheet formula injection: text starting with
 * = + - @ (or tab/CR) is prefixed with an apostrophe so it is never evaluated.
 */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with a UTF-8 BOM (so Excel shows ₱ and ñ correctly) and CRLF line endings. */
export function toCsv(result: ParseResult): string {
  const combined = isCombined(result);
  const labels = statementsOf(result).map((s) => s.label);
  const lines = [(combined ? [...HEADERS, "Statement"] : HEADERS).join(",")];
  for (const t of result.transactions) {
    lines.push(
      [
        t.date,
        t.time ?? "",
        csvText(t.description),
        csvText(t.referenceNo ?? ""),
        t.debit ? plain(t.debit) : "",
        t.credit ? plain(t.credit) : "",
        plain(t.balance),
        csvText(balanceCheckLabel(t, formatMoney)),
        csvText(notesLabel(t)),
        csvText(t.category ?? ""),
        ...(combined ? [csvText(labels[t.statement ?? 0] ?? "")] : []),
      ].join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
