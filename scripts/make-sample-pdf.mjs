// Builds the FAKE sample statements used by the "Try a sample statement" button:
//   public/sample/sample-gcash-statement.pdf (GCash Transaction History layout, home page)
//   public/sample/sample-maya-statement.pdf  (Maya Wallet Statement of Account layout, Maya page)
//   public/sample/sample-bpi-statement.pdf   (BPI account statement layout, BPI page)
//   public/sample/sample-bdo-statement.pdf   (BDO Account Activities layout, BDO page)
//   node scripts/make-sample-pdf.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { pagesToPdf } from "./fake-pdf.mjs";
import { sampleBdoStatementPages } from "./sample-bdo-statement.mjs";
import { sampleBpiStatementPages } from "./sample-bpi-statement.mjs";
import { sampleMayaStatementPages } from "./sample-maya-statement.mjs";
import { sampleStatementPages } from "./sample-statement.mjs";

mkdirSync("public/sample", { recursive: true });
writeFileSync("public/sample/sample-gcash-statement.pdf", pagesToPdf(sampleStatementPages()));
writeFileSync("public/sample/sample-maya-statement.pdf", pagesToPdf(sampleMayaStatementPages()));
writeFileSync("public/sample/sample-bpi-statement.pdf", pagesToPdf(sampleBpiStatementPages()));
writeFileSync("public/sample/sample-bdo-statement.pdf", pagesToPdf(sampleBdoStatementPages()));
console.log("Wrote public/sample/sample-{gcash,maya,bpi,bdo}-statement.pdf");
