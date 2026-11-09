// Reads a payment receipt's OCR text (from a screenshot, see src/ocr/readImage.ts) into the one
// line the payment checker understands: "<reference no.> ₱<amount>". Pure; no guessing beyond
// what the text shows. The line is put in the checker's text box, so the user sees exactly what
// was read and can correct it before trusting the result.
import { formatMoney, parseMoney } from "./money.ts";
import { normalizeRef } from "./paymentCheck.ts";

export interface ReceiptRead {
  /** Reference number (digits/letters only), when one was found. */
  ref?: string;
  /** Amount in centavos, when the receipt shows one clear amount. */
  amount?: number;
}

/** Shortest number taken as a reference (GCash prints 13 digits). */
const MIN_REF = 8;

// OCR often reads digits as look-alike letters inside a number: fix them only after a "Ref" label.
const LOOKALIKES: Record<string, string> = { O: "0", o: "0", l: "1", I: "1", "|": "1" };
const REF_LABEL_RE =
  /\b(?:[Rr]ef(?:erence)?|REF(?:ERENCE)?)\.?\s*(?:[Nn]o\.?|NO\.?|[Nn]umber|#)?\s*[:.#]?\s*(\d[0-9OolI| -]{6,}[0-9OolI|])(?![A-Za-z0-9])/;
const DIGIT_RUN_RE = /\d(?:[ -]?\d){7,}/g;
// "₱500.00", "PHP 1,500.00", "P500.00" (OCR often drops the ₱ bar) or a bare "1,500.00".
const AMOUNT_RE = /(?:₱|PHP\s?|\bP\s?)?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d])/gi;

/** Mobile numbers aren't reference numbers: 09XXXXXXXXX or 639XXXXXXXXX. */
const looksLikePhone = (digits: string) => /^(?:09\d{9}|639\d{9})$/.test(digits);

/**
 * Ways to read a number OCR saw as "722986942 0": GCash prints references without spaces and puts
 * a copy icon right after them, which OCR often reads as a stray "0". So when the first group is
 * already reference-length, it comes first; the joined digits stay as a second guess (for
 * receipts that do group digits, e.g. "4000 000 000001").
 */
function readings(raw: string): string[] {
  const first = normalizeRef(raw.split(/[ -]/)[0] ?? "");
  const joined = normalizeRef(raw);
  return first.length >= MIN_REF && first !== joined ? [first, joined] : [joined];
}

function readRef(text: string, knownRefs: ReadonlySet<string>): string | undefined {
  const candidates: string[] = [];
  const add = (ref: string) => {
    if (ref.length >= MIN_REF && !looksLikePhone(ref) && !candidates.includes(ref)) {
      candidates.push(ref);
    }
  };
  const labelled = REF_LABEL_RE.exec(text)?.[1];
  const fromLabel = labelled
    ? readings(labelled.replace(/[OolI|]/g, (c) => LOOKALIKES[c] ?? c))
    : [];
  fromLabel.forEach(add);
  for (const m of text.match(DIGIT_RUN_RE) ?? []) readings(m).forEach(add);
  // The statement's own reference numbers settle it; otherwise trust the "Ref No." label, then
  // the first long number.
  return candidates.find((c) => knownRefs.has(c)) ?? fromLabel[0] ?? candidates[0];
}

function readAmount(text: string): number | undefined {
  const lines = text.split(/\r?\n/);
  const amountsOn = (line: string) =>
    [...line.matchAll(AMOUNT_RE)]
      .map((m) => parseMoney(`${m[1]}.${m[2]}`))
      .filter((n): n is number => n !== null && n > 0);
  const all = new Set(lines.flatMap(amountsOn));
  if (all.size === 1) return [...all][0];
  // Several different amounts (amount, fee, total): take the one labelled "Amount", not "Total"
  // or "Fee" (what the receiver gets is the amount sent). Otherwise leave it out.
  const labelled = new Set(
    lines
      .filter((l) => /\bamount\b/i.test(l) && !/\b(total|fee|charge)\b/i.test(l))
      .flatMap(amountsOn),
  );
  return labelled.size === 1 ? [...labelled][0] : undefined;
}

/** Find the reference number and amount in a receipt's OCR text. */
export function readReceiptText(
  text: string,
  knownRefs: ReadonlySet<string> = new Set(),
): ReceiptRead {
  const ref = readRef(text, knownRefs);
  const amount = readAmount(text);
  return { ...(ref ? { ref } : {}), ...(amount !== undefined ? { amount } : {}) };
}

/** The checker line for a receipt, e.g. "4000000000001 ₱500.00"; "" when nothing was found. */
export function receiptLine({ ref, amount }: ReceiptRead): string {
  return [ref ?? "", amount !== undefined ? `₱${formatMoney(amount)}` : ""]
    .filter(Boolean)
    .join(" ");
}
