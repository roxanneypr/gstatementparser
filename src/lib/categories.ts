// Auto-categorization: a best-guess category for each transaction, from its description and
// direction. Guesses only label rows; they never change amounts. The user can change any row's
// category, and the change applies to every row with the same description (see `categoryKey`).
// Changes live in memory for this session only; nothing is stored.
import type { ParseResult, Transaction } from "../parsers/types.ts";

export const CATEGORIES = [
  "Salary",
  "Money received",
  "Cash in",
  "Refunds",
  "Interest",
  "Money sent",
  "Cash withdrawal",
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Load",
  "Subscriptions",
  "Payments",
  "Fees & taxes",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const isCategory = (v: string): v is Category =>
  (CATEGORIES as readonly string[]).includes(v);

interface Rule {
  category: Category;
  pattern: RegExp;
  /** Only for money in ("in") or money out ("out"); both when omitted. */
  only?: "in" | "out";
}

/**
 * First match wins, so specific rules come before generic ones. Patterns use wording seen on
 * real GCash, Maya, BPI and BDO statements (e.g. "Payment to …", "Transfer from … to …",
 * "Sent via Instapay", "POS W/D SV …", "InstaPay Transfer Fee") plus well-known merchant names.
 */
const RULES: Rule[] = [
  { category: "Refunds", pattern: /\brefund/i, only: "in" },
  {
    category: "Fees & taxes",
    pattern: /\bfees?\b|service ch(ar)?ge?|\bsvc ch|\btax\b|withheld|withholding/i,
  },
  { category: "Interest", pattern: /\binterest\b/i, only: "in" },
  { category: "Salary", pattern: /payroll|salary/i, only: "in" },

  // Merchants (before the generic transfer/payment rules). Food before Transport for GrabFood.
  {
    category: "Food",
    pattern:
      /foodpanda|grab ?food|jollibee|mcdo|mcdonald|starbucks|coffee|caf[eé]\b|kfc|chowking|mang inasal|greenwich|restaurant|bakery|bakeshop|\bfood\b|manam|pizza|ramen|milk ?tea/i,
  },
  {
    category: "Transport",
    pattern:
      /\bgrab\b|angkas|joyride|move ?it|\bmrt|\blrt|\bbeep\b|easytrip|autosweep|petron|\bshell\b|caltex|seaoil|cleanfuel|\bride\b/i,
  },
  {
    category: "Subscriptions",
    pattern:
      /netflix|spotify|youtube|disney|\bhbo\b|\bviu\b|apple\.com|itunes|google ?(play|one|storage)|claude|openai|chatgpt|prime video|canva|classpass/i,
  },
  {
    category: "Shopping",
    pattern:
      /shopee|lazada|tiktok ?shop|zalora|uniqlo|\bzara\b|h&m|\bsm\b|robinsons|puregold|7[- ]?eleven|ministop|alfamart|watsons|mercury drug|savemore|landers|s&r|ikea/i,
  },
  {
    category: "Bills",
    pattern:
      /paid bill|bills? ?pay|bill payment|meralco|maynilad|manila water|pldt|converge|sky ?cable|insurance|repayment/i,
  },
  { category: "Load", pattern: /\b(re)?load\b/i, only: "out" },

  // Generic: card purchases at a store come before cash withdrawals ("POS W/D" is a purchase).
  { category: "Payments", pattern: /\bpos\b|purchase/i, only: "out" },
  { category: "Cash withdrawal", pattern: /\batm\b|w\/d|withdraw|cash ?out/i, only: "out" },
  { category: "Cash in", pattern: /cash ?-?in\b/i, only: "in" },
  {
    category: "Money received",
    pattern: /receiv|transfer|instapay|pesonet|\bibtd\b|deposit|to saving/i,
    only: "in",
  },
  {
    category: "Money sent",
    pattern:
      /^sent\b|\bsent (to|via)\b|transfer|instapay|pesonet|\bibtw\b|send money|cash ?-?in\b/i,
    only: "out",
  },
  { category: "Payments", pattern: /payment|\bpaid\b|\bqr|purchased/i, only: "out" },
];

/** Best guess from the description and direction; "Other" when nothing fits. */
export function guessCategory(t: Pick<Transaction, "description" | "credit" | "debit">): Category {
  const direction = t.credit > 0 ? "in" : t.debit > 0 ? "out" : undefined;
  for (const rule of RULES) {
    if (rule.only && rule.only !== direction) continue;
    if (rule.pattern.test(t.description)) return rule.category;
  }
  return "Other";
}

/**
 * Rows that share this key get the same category when the user changes one of them. Drops
 * per-payment details (GCash's "Merchant Transaction Number: …") so repeat payments to the same
 * merchant match, but keeps account and phone numbers so different people stay apart.
 */
export function categoryKey(description: string): string {
  return description
    .replace(/,?\s*merchant transaction number:.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** User changes: categoryKey(description) → category. */
export type CategoryOverrides = ReadonlyMap<string, Category>;

/** Copy of the result with `category` set on every transaction. */
export function categorize<T extends ParseResult>(
  result: T,
  overrides: CategoryOverrides = new Map(),
): T {
  return {
    ...result,
    transactions: result.transactions.map((t) => ({
      ...t,
      category: overrides.get(categoryKey(t.description)) ?? guessCategory(t),
    })),
  };
}
