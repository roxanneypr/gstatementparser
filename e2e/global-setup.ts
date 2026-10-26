// Builds FAKE PDFs from the synthetic fixture (PDFs are git-ignored, so they're generated per run).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { PageText } from "../src/parsers/types.ts";
import { pagesToPdf } from "../scripts/fake-pdf.mjs";

export const GENERATED = "e2e/.generated";

export default function globalSetup() {
  mkdirSync(GENERATED, { recursive: true });
  const { pages } = JSON.parse(readFileSync("tests/fixtures/gcash-basic.json", "utf8")) as {
    pages: PageText[];
  };
  writeFileSync(`${GENERATED}/clean.pdf`, pagesToPdf(pages));

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
