import { bdoParser } from "./bdo.ts";
import { bpiParser } from "./bpi.ts";
import { gcashParser } from "./gcash.ts";
import { genericParser } from "./generic.ts";
import { mayaParser } from "./maya.ts";
import type { PageText, ParseResult, StatementParser } from "./types.ts";

/** Bank-specific parsers. Each recognises only its own statement's exact table header. */
export const parsers: StatementParser[] = [gcashParser, mayaParser, bpiParser, bdoParser];

/** Pick the first bank-specific parser that recognises this PDF, or null if none do. */
export function detectParser(pages: PageText[]): StatementParser | null {
  return parsers.find((p) => p.canParse(pages)) ?? null;
}

/**
 * Read a statement: the bank-specific parser when one recognises it, otherwise the general reader
 * (beta). The general reader is also tried when a known layout is recognised but no rows come out
 * of it (e.g. the bank changed its layout). Returns null when nothing can read it.
 */
export function parseStatement(pages: PageText[]): ParseResult | null {
  const specific = detectParser(pages);
  const result = specific?.parse(pages) ?? null;
  if (result?.transactions.length) return result;
  if (genericParser.canParse(pages)) return genericParser.parse(pages);
  return result;
}
