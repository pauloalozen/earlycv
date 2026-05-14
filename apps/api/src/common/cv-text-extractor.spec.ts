import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UnsupportedCvFileTypeError,
  extractTextFromCvFile,
} from "./cv-text-extractor";

test("extractTextFromCvFile rejects empty file buffers", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.alloc(0),
      mimetype: "application/pdf",
      originalname: "cv.pdf",
    }),
    /empty|unreadable/i,
  );
});

test("extractTextFromCvFile rejects MIME-extension mismatch", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.from("%PDF-1.7"),
      mimetype: "application/msword",
      originalname: "cv.pdf",
    }),
    UnsupportedCvFileTypeError,
  );
});

test("extractTextFromCvFile rejects unsupported extension", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.from("content"),
      mimetype: "application/pdf",
      originalname: "cv.txt",
    }),
    UnsupportedCvFileTypeError,
  );
});

test("extractTextFromCvFile rejects legacy DOC format", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.from("D0CF11E0"),
      mimetype: "application/msword",
      originalname: "cv.doc",
    }),
    UnsupportedCvFileTypeError,
  );
});

test("extractTextFromCvFile rejects files above 5MB before parsing", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      mimetype:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalname: "cv.docx",
    }),
    /5 MB/i,
  );
});

test("extractTextFromCvFile rejects DOCX without ZIP signature", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.from("not-a-zip"),
      mimetype:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalname: "cv.docx",
    }),
    /DOCX invalido/i,
  );
});

test("extractTextFromCvFile rejects ODT without ZIP signature", async () => {
  await assert.rejects(
    extractTextFromCvFile({
      buffer: Buffer.from("not-a-zip"),
      mimetype: "application/vnd.oasis.opendocument.text",
      originalname: "cv.odt",
    }),
    /ODT invalido/i,
  );
});

test("extractTextFromCvFile rejects malformed DOCX structure", async () => {
  const fakeZipMissingWordDocument = Buffer.concat([
    Buffer.from("PK\u0003\u0004", "binary"),
    Buffer.from("[Content_Types].xml"),
  ]);

  await assert.rejects(
    extractTextFromCvFile({
      buffer: fakeZipMissingWordDocument,
      mimetype: "application/octet-stream",
      originalname: "cv.docx",
    }),
    /DOCX invalido/i,
  );
});

test("extractTextFromCvFile rejects malformed ODT structure", async () => {
  const fakeZipMissingContentXml = Buffer.concat([
    Buffer.from("PK\u0003\u0004", "binary"),
    Buffer.from("mimetype"),
    Buffer.from("application/vnd.oasis.opendocument.text"),
  ]);

  await assert.rejects(
    extractTextFromCvFile({
      buffer: fakeZipMissingContentXml,
      mimetype: "application/octet-stream",
      originalname: "cv.odt",
    }),
    /ODT invalido/i,
  );
});
