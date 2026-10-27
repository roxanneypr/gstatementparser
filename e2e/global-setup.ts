// Builds FAKE PDFs from the synthetic fixture (PDFs are git-ignored, so they're generated per run).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { PageText } from "../src/parsers/types.ts";
import { pagesToPdf } from "../scripts/fake-pdf.mjs";
import { twoMonthStatement } from "../scripts/fake-statement.mjs";

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
