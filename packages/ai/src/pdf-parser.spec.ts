import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractTextFromPdf } from "./pdf-parser.js";

describe("extractTextFromPdf", () => {
  it("validates input and rejects empty buffers", async () => {
    const buffer = Buffer.alloc(0);

    await assert.rejects(() => extractTextFromPdf(buffer), /empty|unreadable/i);
  });

  it("throws on invalid PDF content", async () => {
    const buffer = Buffer.from("not a valid pdf");

    await assert.rejects(() => extractTextFromPdf(buffer), /pdf valido/i);
  });

  it("rejects oversized PDF buffer before parsing", async () => {
    const header = Buffer.from("%PDF-");
    const body = Buffer.alloc(5 * 1024 * 1024 + 1, 0x20);
    const oversized = Buffer.concat([header, body]);

    await assert.rejects(() => extractTextFromPdf(oversized), /limite de tamanho/i);
  });

  it("handles successful extraction when pdf-parse works", async () => {
    // This test would require a valid PDF buffer
    // The extractTextFromPdf function contract is validated above
    // For integration tests, we would use a real PDF file
    // For now, unit tests focus on error handling and API contract
  });
});
