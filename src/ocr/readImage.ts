// Reads the text in a screenshot (a payment receipt) on this device with tesseract.js. The engine,
// its WebAssembly core and the English data are served from our own site (/ocr/, copied by
// scripts/copy-ocr-assets.mjs), never a CDN, and the image never leaves the browser. Loaded lazily
// (dynamic import) only when someone adds a screenshot.
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

const OCR_PATH = "/ocr";

let worker: Promise<Worker> | undefined;

/** One OCR worker for the visit (starting one loads ~7 MB, cached by the browser afterwards). */
function sharedWorker(): Promise<Worker> {
  worker ??= createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${OCR_PATH}/worker.min.js`,
    corePath: OCR_PATH, // a folder: the worker picks the core this CPU supports
    langPath: OCR_PATH,
    workerBlobURL: false, // a same-origin worker script; no blob: wrapper needed
    cacheMethod: "none", // don't keep a copy of the language data in IndexedDB
  }).then(async (w) => {
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      // A fixed DPI: screenshots carry none, and estimating it logs a console error per image.
      user_defined_dpi: "300",
    });
    return w;
  });
  worker.catch(() => (worker = undefined)); // let a later try start over
  return worker;
}

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

/**
 * Draw the image on a canvas OCR reads well: grey, dark text on a light background (dark-mode
 * screenshots are inverted), small screenshots enlarged and huge ones reduced.
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("unreadable image");
  }
  const w = bitmap.width;
  const grow = w < 1200 ? Math.min(2, 1200 / w) : w > 2400 ? 2400 / w : 1;
  const width = Math.round(bitmap.width * grow);
  const height = Math.round(bitmap.height * grow);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ImageError("no canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, width, height);
  const px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const grey = 0.299 * (px[i] ?? 0) + 0.587 * (px[i + 1] ?? 0) + 0.114 * (px[i + 2] ?? 0);
    px[i] = px[i + 1] = px[i + 2] = grey;
    sum += grey;
  }
  if (sum / (px.length / 4) < 128) {
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - (px[i] ?? 0);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** The text tesseract reads in an image file (screenshot or photo of a receipt). */
export async function readImageText(file: Blob): Promise<string> {
  const canvas = await prepare(file);
  const ocr = await sharedWorker();
  const { data } = await ocr.recognize(canvas);
  return data.text;
}
