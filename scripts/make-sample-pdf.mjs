// Builds the FAKE sample statements used by the "Try a sample statement" button:
//   public/sample/sample-gcash-statement.pdf (GCash Transaction History layout, home page)
//   public/sample/sample-maya-statement.pdf  (Maya Wallet Statement of Account layout, Maya page)
//   node scripts/make-sample-pdf.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { pagesToPdf } from "./fake-pdf.mjs";
import { sampleMayaStatementPages } from "./sample-maya-statement.mjs";
import { sampleStatementPages } from "./sample-statement.mjs";

mkdirSync("public/sample", { recursive: true });
writeFileSync("public/sample/sample-gcash-statement.pdf", pagesToPdf(sampleStatementPages()));
writeFileSync("public/sample/sample-maya-statement.pdf", pagesToPdf(sampleMayaStatementPages()));
console.log("Wrote public/sample/sample-gcash-statement.pdf and sample-maya-statement.pdf");
