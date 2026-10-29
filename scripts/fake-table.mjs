// FAKE bank statement tables (positioned text pages, ready for scripts/fake-pdf.mjs) in the
// layouts the general reader (src/parsers/generic.ts) has to handle: separate debit/credit
// columns, one signed amount column, DR/CR suffixes, wrapped descriptions, several pages, two-line
// headers. Everything is made up; no real statement data.

// Helvetica advance widths (per 1000 em) for the characters amounts and dates use; scripts/
// fake-pdf.mjs draws in Helvetica, so right-aligned amounts land where pdf.js measures them.
const NARROW = { " ": 278, ",": 278, ".": 278, ":": 278, "/": 278, "-": 333, "(": 333, ")": 333 };
const SIZE = 8;
export const textWidth = (s, size = SIZE) =>
  Math.round(([...s].reduce((sum, c) => sum + (NARROW[c] ?? 556), 0) * size) / 100) / 10;

const item = (str, x, y, size = SIZE) => ({ str, x, y, width: textWidth(str, size), height: size });

/**
 * @typedef {object} Column
 * @property {string | string[]} label header text; an array stacks it on two lines
 * @property {number} x left edge of the header (and of left-aligned cells)
 * @property {"left" | "right"} [align] right: cells end where the header ends
 *
 * @param {object} o
 * @param {Column[]} o.columns
 * @param {Array<Array<string | string[]>>} o.rows one cell per column; an array wraps the cell
 *   over several lines; "" leaves it empty
 * @param {string[]} [o.above] lines printed above the table on page 1 (title, period, ...)
 * @param {string[][]} [o.below] lines after the last row, one array of cells per line (cells
 *   use the same columns, so totals land under their column)
 * @param {number} [o.rowsPerPage]
 * @param {boolean} [o.repeatHeader] print the header on every page (default true)
 * @param {number} [o.lineHeight]
 */
export function tablePages({
  columns,
  rows,
  above = [],
  below = [],
  rowsPerPage = 30,
  repeatHeader = true,
  lineHeight = 11,
}) {
  const pages = [];
  const headerRight = columns.map((c) => {
    const labels = Array.isArray(c.label) ? c.label : [c.label];
    return c.x + Math.max(...labels.map((l) => textWidth(l)));
  });
  const cellItems = (cells, y) => {
    const out = [];
    let lines = 1;
    cells.forEach((cell, i) => {
      const col = columns[i];
      if (!col) return;
      const parts = Array.isArray(cell) ? cell : [cell];
      lines = Math.max(lines, parts.length);
      parts.forEach((text, n) => {
        if (!text) return;
        const x =
          col.align === "right" ? Math.round((headerRight[i] - textWidth(text)) * 10) / 10 : col.x;
        out.push(item(text, x, y + n * lineHeight));
      });
    });
    return { items: out, lines };
  };

  let page = null;
  let y = 0;
  const newPage = (first) => {
    page = { pageNumber: pages.length + 1, width: 595, height: 842, items: [] };
    pages.push(page);
    y = 60;
    if (first) {
      for (const line of above) {
        page.items.push(item(line, 40, y));
        y += 14;
      }
      y += 10;
    }
    if (first || repeatHeader) {
      const twoLine = columns.some((c) => Array.isArray(c.label));
      columns.forEach((c, i) => {
        const labels = Array.isArray(c.label) ? c.label : [c.label];
        const top = twoLine && labels.length === 1 ? y + lineHeight / 2 : y;
        labels.forEach((l, n) => {
          const x =
            c.align === "right" ? Math.round((headerRight[i] - textWidth(l)) * 10) / 10 : c.x;
          page.items.push(item(l, x, top + n * lineHeight));
        });
      });
      y += (twoLine ? 2 : 1) * lineHeight + 8;
    }
  };

  newPage(true);
  rows.forEach((cells, n) => {
    if (n > 0 && n % rowsPerPage === 0) {
      page.items.push(item(`Page ${pages.length}`, 280, 800));
      newPage(false);
    }
    const { items, lines } = cellItems(cells, y);
    page.items.push(...items);
    y += lines * lineHeight + 6;
  });
  for (const cells of below) {
    const { items } = cellItems(cells, y);
    page.items.push(...items);
    y += lineHeight + 6;
  }
  page.items.push(item(`Page ${pages.length}`, 280, 800));
  return pages;
}

/** A FAKE "Sample Bank" savings statement: separate debit/credit columns and running balances. */
export function sampleGenericStatementPages() {
  return tablePages({
    above: ["Sample Bank", "Statement of Account", "Statement Period: 03/01/2026 - 03/31/2026"],
    columns: [
      { label: "Date", x: 40 },
      { label: "Description", x: 100 },
      { label: "Withdrawals", x: 330, align: "right" },
      { label: "Deposits", x: 410, align: "right" },
      { label: "Balance", x: 490, align: "right" },
    ],
    rows: [
      ["", "Opening Balance", "", "", "10,000.00"],
      ["03/02/2026", "Payroll Credit SAMPLE EMPLOYER", "", "25,000.00", "35,000.00"],
      ["03/03/2026", ["Bills Payment", "SAMPLE ELECTRIC CO"], "2,450.75", "", "32,549.25"],
      ["03/05/2026", "ATM Withdrawal SAMPLE BRANCH", "5,000.00", "", "27,549.25"],
      ["03/14/2026", ["InstaPay Transfer to", "SAMPLE RECIPIENT"], "1,500.00", "", "26,049.25"],
      ["03/14/2026", "InstaPay Transfer Fee", "15.00", "", "26,034.25"],
      ["03/20/2026", "Purchase SAMPLE GROCERY", "1,234.50", "", "24,799.75"],
      ["03/31/2026", "Interest Earned", "", "4.10", "24,803.85"],
      ["03/31/2026", "Tax Withheld", "0.82", "", "24,803.03"],
      ["", "Closing Balance", "", "", "24,803.03"],
    ],
  });
}
