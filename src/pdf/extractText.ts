import { getDocument, GlobalWorkerOptions, PasswordResponses, PDFWorker } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageText } from "../parsers/types.ts";
import { toPageText } from "./pageText.ts";

GlobalWorkerOptions.workerSrc = workerUrl;

// One pdf.js worker for the whole visit. Without it, each conversion starts a new worker and
// re-downloads its script, so a second file fails offline (the "try it offline" privacy check).
let worker: PDFWorker | undefined;
const sharedWorker = () => (worker && !worker.destroyed ? worker : (worker = new PDFWorker()));

export type ExtractErrorKind = "password-required" | "wrong-password" | "invalid-pdf";

export class ExtractError extends Error {
  readonly kind: ExtractErrorKind;

  constructor(kind: ExtractErrorKind, message: string) {
    super(message);
    this.name = "ExtractError";
    this.kind = kind;
  }
}

/**
 * Load a PDF entirely in memory (optionally password-protected) and return
 * positioned text items for every page. Nothing leaves the device.
 */
export async function extractText(data: ArrayBuffer, password?: string): Promise<PageText[]> {
  const task = getDocument({
    // pdf.js may transfer/detach the buffer; give it a copy so callers can retry.
    data: new Uint8Array(data.slice(0)),
    password: password || undefined,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
    worker: sharedWorker(),
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    throw toExtractError(err);
  }

  try {
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push(toPageText(n, viewport.height, viewport.width, content.items));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy(); // closes this document; the shared worker keeps no data from it
  }
}

function toExtractError(err: unknown): ExtractError {
  if (err instanceof Error && err.name === "PasswordException") {
    const code = (err as Error & { code?: number }).code;
    return code === PasswordResponses.INCORRECT_PASSWORD
      ? new ExtractError("wrong-password", "Wrong password, try again.")
      : new ExtractError("password-required", "This PDF is password-protected.");
  }
  return new ExtractError("invalid-pdf", "This file couldn't be read as a PDF.");
}
