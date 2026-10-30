// Builds FAKE PDFs from the synthetic fixture (PDFs are git-ignored, so they're generated per run).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { PageText } from "../src/parsers/types.ts";
import { pagesToPdf } from "../scripts/fake-pdf.mjs";
import { buildStatement, twoMonthStatement } from "../scripts/fake-statement.mjs";
import { sampleGenericStatementPages, tablePages } from "../scripts/fake-table.mjs";

export const GENERATED = "e2e/.generated";
export const PASSWORD = "fake-pass-123";

export default function globalSetup() {
  mkdirSync(GENERATED, { recursive: true });
  const { pages } = JSON.parse(readFileSync("tests/fixtures/gcash-basic.json", "utf8")) as {
    pages: PageText[];
  };
  writeFileSync(`${GENERATED}/clean.pdf`, pagesToPdf(pages));
  // Real GCash statements are password-protected; this one uses a fake password.
  writeFileSync(`${GENERATED}/protected.pdf`, pagesToPdf(pages, { password: PASSWORD }));

  // FAKE Maya Wallet statement (same layout as tests/fixtures/maya-basic.json), password-protected.
  const maya = JSON.parse(readFileSync("tests/fixtures/maya-basic.json", "utf8")) as {
    pages: PageText[];
  };
  writeFileSync(`${GENERATED}/maya.pdf`, pagesToPdf(maya.pages, { password: PASSWORD }));

  // FAKE BPI account statement (same layout as tests/fixtures/bpi-basic.json); BPI's has no password.
  const bpi = JSON.parse(readFileSync("tests/fixtures/bpi-basic.json", "utf8")) as {
    pages: PageText[];
  };
  writeFileSync(`${GENERATED}/bpi.pdf`, pagesToPdf(bpi.pages));

  // FAKE BDO Account Activities (same layout as tests/fixtures/bdo-basic.json).
  const bdo = JSON.parse(readFileSync("tests/fixtures/bdo-basic.json", "utf8")) as {
    pages: PageText[];
  };
  writeFileSync(`${GENERATED}/bdo.pdf`, pagesToPdf(bdo.pages));

  // Two FAKE GCash statements of one account that overlap (Mar 16–31 is in both), same password.
  const rows = [
    { dt: "2026-03-02 09:00 AM", desc: "Received GCash from Sample Client", credit: 500000 },
    { dt: "2026-03-10 12:30 PM", desc: "Payment to Angkas", debit: 18600 },
    { dt: "2026-03-16 08:15 AM", desc: "Payment to Foodpanda", debit: 38900 },
    { dt: "2026-03-20 06:45 PM", desc: "Payment to Shopee", debit: 129900 },
    { dt: "2026-03-28 07:00 PM", desc: "Payment to Netflix", debit: 54900 },
  ];
  const later = [
    { dt: "2026-04-03 10:00 AM", desc: "Payment to Angkas", debit: 15400 },
    { dt: "2026-04-09 01:20 PM", desc: "Received GCash from Sample Client", credit: 250000 },
  ];
  const opening = 100000;
  const beforeMar16 = opening + 500000 - 18600;
  writeFileSync(
    `${GENERATED}/gcash-march.pdf`,
    pagesToPdf(buildStatement({ period: ["2026-03-01", "2026-03-31"], opening, txs: rows }), {
      password: PASSWORD,
    }),
  );
  writeFileSync(
    `${GENERATED}/gcash-overlap.pdf`,
    pagesToPdf(
      buildStatement({
        period: ["2026-03-16", "2026-04-15"],
        opening: beforeMar16,
        txs: [...rows.slice(2), ...later],
        firstRef: 4000000000002,
      }),
      { password: PASSWORD },
    ),
  );

  // FAKE statements from a bank without its own parser, for the general reader (beta).
  writeFileSync(`${GENERATED}/other-bank.pdf`, pagesToPdf(sampleGenericStatementPages()));
  writeFileSync(
    `${GENERATED}/other-bank-unchecked.pdf`,
    pagesToPdf(
      tablePages({
        columns: [
          { label: "Date", x: 40 },
          { label: "Description", x: 110 },
          { label: "Amount", x: 400, align: "right" },
        ],
        rows: [
          ["03/02/2026", "Salary", "30,000.00"],
          ["03/15/2026", "Groceries", "-1,250.00"],
        ],
      }),
    ),
  );

  // 45 transactions over two months, for pagination and the monthly view.
  writeFileSync(`${GENERATED}/two-months.pdf`, pagesToPdf(twoMonthStatement(45)));
  writeFileSync(
    `${GENERATED}/two-months-gaps.pdf`,
    pagesToPdf(twoMonthStatement(45, { unchangedRows: [7, 8, 30] })),
  );

  // Same statement, but row 5's printed balance doesn't move (the real-world pattern).
  const gap = structuredClone(pages);
  for (const p of gap) for (const i of p.items) if (i.str === "2769.50") i.str = "2855.00";
  writeFileSync(`${GENERATED}/balance-gap.pdf`, pagesToPdf(gap));

  writeFileSync(
    `${GENERATED}/not-gcash.pdf`,
    pagesToPdf([
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        items: [{ str: "Quarterly report", x: 50, y: 60, width: 80, height: 12 }],
      },
    ]),
  );
  writeFileSync(
    `${GENERATED}/no-text.pdf`,
    pagesToPdf([{ pageNumber: 1, width: 595, height: 842, items: [] }]),
  );
  writeFileSync(`${GENERATED}/not-really.pdf`, "this is not a pdf");
}
