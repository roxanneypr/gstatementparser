import { gcashParser } from "./gcash.ts";
import { mayaParser } from "./maya.ts";
import type { PageText, StatementParser } from "./types.ts";

export const parsers: StatementParser[] = [gcashParser, mayaParser];

/** Pick the first parser that recognises this PDF, or null if none do. */
export function detectParser(pages: PageText[]): StatementParser | null {
  return parsers.find((p) => p.canParse(pages)) ?? null;
}
