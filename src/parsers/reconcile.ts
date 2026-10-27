import { formatMoney } from "../lib/money.ts";
import type { ParseResult } from "./types.ts";

/** Figures a statement prints about itself, in centavos (any may be missing). */
export interface StatementSummary {
  opening?: number;
  closing?: number;
  totalDebit?: number;
  totalCredit?: number;
}

/**
 * Shared by every parser: fill `checks`, statement-level warnings and each row's `balanceIssue`.
 * The statement's figures are never changed; gaps are only described.
 */
export function reconcile(result: ParseResult, summary: StatementSummary): void {
  const { transactions: txs, warnings, checks } = result;

  if (summary.opening === undefined) warnings.push("Starting balance not found.");
  if (summary.closing === undefined) warnings.push("Ending balance not found.");
  if (!txs.length) warnings.push("No transactions found.");

  // Running balance: previous balance + credit − debit must equal this row's balance.
  // We never "fix" the statement's figures; we only describe the gap on the row.
  let prev = summary.opening;
  let compared = 0;
  let mismatched = 0;
  for (const tx of txs) {
    if (tx.balance === undefined) {
      prev = undefined;
      continue;
    }
    if (prev !== undefined) {
      const difference = tx.balance - (prev + tx.credit - tx.debit);
      compared++;
      if (difference !== 0) {
        mismatched++;
        tx.balanceIssue = { kind: tx.balance === prev ? "unchanged" : "different", difference };
      }
    }
    prev = tx.balance;
  }
  if (compared) checks.runningBalanceOk = mismatched === 0;

  const totalDebit = txs.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txs.reduce((s, t) => s + t.credit, 0);
  if (summary.totalDebit !== undefined || summary.totalCredit !== undefined) {
    checks.totalsMatchStatement =
      (summary.totalDebit === undefined || summary.totalDebit === totalDebit) &&
      (summary.totalCredit === undefined || summary.totalCredit === totalCredit);
  }
  if (summary.totalDebit !== undefined && summary.totalDebit !== totalDebit) {
    warnings.push(
      `Total debit mismatch: statement says ${formatMoney(summary.totalDebit)}, rows add up to ${formatMoney(totalDebit)}.`,
    );
  }
  if (summary.totalCredit !== undefined && summary.totalCredit !== totalCredit) {
    warnings.push(
      `Total credit mismatch: statement says ${formatMoney(summary.totalCredit)}, rows add up to ${formatMoney(totalCredit)}.`,
    );
  }
  if (summary.opening !== undefined && summary.closing !== undefined) {
    const expected = summary.opening + totalCredit - totalDebit;
    // Reported via `checks` (the UI shows the difference); not repeated as a warning.
    checks.openingToClosingOk = expected === summary.closing;
  }
  const last = txs[txs.length - 1];
  if (
    last?.balance !== undefined &&
    summary.closing !== undefined &&
    last.balance !== summary.closing
  ) {
    warnings.push(
      `Last row balance ${formatMoney(last.balance)} doesn't match ending balance ${formatMoney(summary.closing)}.`,
    );
  }
}
