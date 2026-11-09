// Copies the OCR engine (tesseract.js worker, WebAssembly core, English data) into public/ocr/ so
// the "Add screenshots" button loads it from our own site, never a CDN. Runs before dev and build
// (package.json "predev"/"prebuild"); public/ocr/ is git-ignored. Only LSTM cores are copied (the
// worker runs with OEM 1, LSTM only) and the browser downloads just the one its CPU supports.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const out = "public/ocr";
mkdirSync(out, { recursive: true });

const files = [
  [join(pkgDir("tesseract.js"), "dist/worker.min.js"), "worker.min.js"],
  ...["", "-simd", "-relaxedsimd"].map((v) => [
    join(pkgDir("tesseract.js-core"), `tesseract-core${v}-lstm.wasm.js`),
    `tesseract-core${v}-lstm.wasm.js`,
  ]),
  [
    join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int/eng.traineddata.gz"),
    "eng.traineddata.gz",
  ],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`OCR assets copied to ${out}/`);
