/** One positioned text run from a PDF page. Coordinates are in PDF points, origin top-left. */
export interface TextItem {
  str: string;
  x: number;
  /** Baseline y, measured from the top of the page (grows downward). */
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface PageText {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface Transaction {
  /** ISO date, e.g. "2026-03-14" */
  date: string;
  /** "13:05" if available */
  time?: string;
  description: string;
  referenceNo?: string;
  /** centavos, >= 0 */
  debit: number;
  /** centavos, >= 0 */
  credit: number;
  /** centavos, running balance if shown */
  balance?: number;
  /** original line(s), for debugging / flagged rows */
  raw?: string;
  /** problems reading this row (missing date, ambiguous amounts, ...); highlight in the preview */
  flags?: string[];
  /**
   * Set when this row's balance doesn't follow from the previous row's balance.
   * The statement's own figures are kept as-is; this only describes the gap.
   */
  balanceIssue?: BalanceIssue;
}

export interface BalanceIssue {
  /** "unchanged": the balance stayed the same despite this transaction; "different": it moved by another amount. */
  kind: "unchanged" | "different";
  /** balance − (previous balance + credit − debit), in centavos */
  difference: number;
}

export interface ParseResult {
  source: "gcash" | "maya" | "bpi";
  accountName?: string;
  /** mask in UI: show only last 4 digits */
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  /** Totals printed on the statement itself (e.g. "Total Debit"/"Total Credit"), in centavos. */
  statementTotals?: { debit?: number; credit?: number };
  transactions: Transaction[];
  /** Set when the user turned on "Clean up": rows removed because they didn't change the balance. */
  cleanedUp?: { removed: number };
  /** statement-level problems: unplaced text, missing balances, totals mismatches, etc.
   *  Row-level problems live on each Transaction (`flags`, `balanceIssue`). */
  warnings: string[];
  checks: ReconciliationChecks;
}

/** Each check is `null` when the statement doesn't give enough information to run it. */
export interface ReconciliationChecks {
  /** Sum of parsed debits/credits equals the statement's own "Total Debit"/"Total Credit". */
  totalsMatchStatement: boolean | null;
  /** Every row's balance = previous balance + credit − debit. */
  runningBalanceOk: boolean | null;
  /** opening + credits − debits = closing. */
  openingToClosingOk: boolean | null;
}

export interface StatementParser {
  id: string;
  label: string;
  canParse(pages: PageText[]): boolean;
  parse(pages: PageText[]): ParseResult;
}
