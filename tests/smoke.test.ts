import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

describe("scaffold", () => {
  it("loads SheetJS from the CDN build", () => {
    expect(typeof XLSX.utils.book_new).toBe("function");
  });
});
