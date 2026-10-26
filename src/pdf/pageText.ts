// Pure helpers (no pdf.js import) so they run in tests, the browser, and Node debug scripts.
import type { PageText, TextItem } from "../parsers/types.ts";

/** Minimal shape of a pdf.js text item; avoids depending on pdf.js types here. */
export interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

export function toPageText(
  pageNumber: number,
  pageHeight: number,
  pageWidth: number,
  rawItems: readonly unknown[],
): PageText {
  const items: TextItem[] = [];
  for (const raw of rawItems) {
    if (!isRawTextItem(raw)) continue; // skip marked-content markers
    if (raw.str.trim() === "") continue;
    const [, , , , tx = 0, ty = 0] = raw.transform;
    items.push({
      str: raw.str,
      x: round(tx),
      y: round(pageHeight - ty),
      width: round(raw.width),
      height: round(raw.height),
      fontName: raw.fontName,
    });
  }
  return { pageNumber, width: round(pageWidth), height: round(pageHeight), items };
}

export interface Row {
  y: number;
  items: TextItem[];
}

/** Group items into visual rows by y (within `tolerance` points), each row sorted by x. */
export function groupRows(items: readonly TextItem[], tolerance = 2): Row[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(item.y - last.y) <= tolerance) {
      last.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

/** Human-readable dump of a page: one line per row, each item as `x:"text"`. */
export function formatPageDump(page: PageText, redact = false): string {
  const lines = [`=== Page ${page.pageNumber} (${page.width} x ${page.height}) ===`];
  for (const row of groupRows(page.items)) {
    const cells = row.items.map(
      (i) => `${i.x}:${JSON.stringify(redact ? redactText(i.str) : i.str)}`,
    );
    lines.push(`y=${row.y.toFixed(1).padStart(6)} | ${cells.join("  ")}`);
  }
  return lines.join("\n");
}

/** Mask digits and emails but keep shape (e.g. "1,234.56" -> "9,999.99"). */
export function redactText(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>").replace(/\d/g, "9");
}

function isRawTextItem(v: unknown): v is RawTextItem {
  return typeof v === "object" && v !== null && "str" in v && "transform" in v;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
