// Optional "Clean up": drop transactions that didn't change the running balance (the statement
// lists them, but the balance stays the same as the row before). Off by default; the user opts in.
import type { ParseResult, Transaction } from "../parsers/types.ts";

export const isUnchanged = (t: Transaction) => t.balanceIssue?.kind === "unchanged";

export function countUnchanged(result: ParseResult): number {
  return result.transactions.filter(isUnchanged).length;
}

/**
 * Returns a copy without the unchanged-balance rows, with the balance checks recomputed for what
 * remains. Removing such a row never breaks the running balance of the rows after it (its balance
 * equals the previous one). `totalsMatchStatement` keeps the original value: it describes whether
 * the PDF was read correctly, which clean-up doesn't change.
 */
export function cleanUp(result: ParseResult): ParseResult {
  const kept = result.transactions.filter((t) => !isUnchanged(t));
  const removed = result.transactions.length - kept.length;
  if (!removed) return result;

  const withBalance = kept.filter((t) => t.balance !== undefined);
  const moneyIn = kept.reduce((s, t) => s + t.credit, 0);
  const moneyOut = kept.reduce((s, t) => s + t.debit, 0);
  const { openingBalance: opening, closingBalance: closing } = result;

  return {
    ...result,
    transactions: kept,
    cleanedUp: { removed },
    checks: {
      totalsMatchStatement: result.checks.totalsMatchStatement,
      runningBalanceOk: withBalance.length ? kept.every((t) => !t.balanceIssue) : null,
      openingToClosingOk:
        opening !== undefined && closing !== undefined
          ? opening + moneyIn - moneyOut === closing
          : null,
    },
  };
}
