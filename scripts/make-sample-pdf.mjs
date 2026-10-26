// Builds public/sample/sample-gcash-statement.pdf: a FAKE statement in the real GCash
// Transaction History layout, used by the "Try a sample statement" button.
//   node scripts/make-sample-pdf.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { pagesToPdf } from "./fake-pdf.mjs";
import { sampleStatementPages } from "./sample-statement.mjs";

mkdirSync("public/sample", { recursive: true });
writeFileSync("public/sample/sample-gcash-statement.pdf", pagesToPdf(sampleStatementPages()));
console.log("Wrote public/sample/sample-gcash-statement.pdf");
