// Money is always integer centavos internally. Never use floats for sums.

const MONEY_RE = /^(-)?(?:₱|PHP\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/i;

/** Parse "1,234.56" / "₱1234.5" / "-12.00" into centavos. Returns null if not a money string. */
export function parseMoney(input: string): number | null {
  const m = MONEY_RE.exec(input.trim().replace(/\s+/g, ""));
  if (!m) return null;
  const [, sign, whole = "", frac = ""] = m;
  const centavos = Number(whole.replace(/,/g, "")) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return null;
  return sign ? -centavos : centavos;
}

/** Format centavos as "1,234.56" (no currency symbol). */
export function formatMoney(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/** Centavos to a peso number for spreadsheets (display/export only). */
export function toPesos(centavos: number): number {
  return centavos / 100;
}
