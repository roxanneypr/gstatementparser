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
  /** Best-guess or user-chosen category (src/lib/categories.ts); a label only, never parsed. */
  category?: string;
  /** Index into `Workbook.statements` when several statements are combined (src/lib/combine.ts). */
  statement?: number;
}

export interface BalanceIssue {
  /** "unchanged": the balance stayed the same despite this transaction; "different": it moved by another amount. */
  kind: "unchanged" | "different";
  /** balance − (previous balance + credit − debit), in centavos */
  difference: number;
}

export interface ParseResult {
  /**
   * "generic": read by the general reader (beta), not a bank-specific parser.
   * "mixed": a workbook combining statements from different sources.
   */
  source: "gcash" | "maya" | "bpi" | "bdo" | "generic" | "mixed";
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

/** One statement inside a workbook. */
export interface WorkbookStatement {
  /** e.g. "GCash · Mar 1 – Mar 31, 2026" (or the file name) */
  label: string;
  /** the statement as parsed (possibly cleaned up), before combining */
  result: ParseResult;
  /** rows of this statement left out because an earlier statement of the same account has them */
  duplicates: number;
}

/**
 * Several statements combined into one result (one statement is a workbook of one). The merged
 * `transactions` carry `statement`; checks stay per statement and are summarised here.
 */
export interface Workbook extends ParseResult {
  statements: WorkbookStatement[];
  /** Rows that appear in two overlapping statements of the same account. */
  duplicates: { found: number; removed: boolean };
  /** How many different accounts the statements come from. */
  accounts: number;
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
