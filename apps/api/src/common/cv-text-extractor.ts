import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);
const MIN_CV_CHARS = 100;
const MAX_CV_CHARS = 30_000;
const MAX_CV_UPLOAD_BYTES = 5 * 1024 * 1024;
const EXTRACTION_TIMEOUT_MS = 8_000;
const CV_SIGNALS_PT = [
  "experiência",
  "experiencia",
  "formação",
  "formacao",
  "habilidades",
  "competências",
  "competencias",
  "educação",
  "educacao",
  "currículo",
  "curriculo",
  "qualificações",
  "qualificacoes",
];
const CV_SIGNALS_EN = [
  "experience",
  "education",
  "skills",
  "employment",
  "resume",
  "university",
  "degree",
  "certification",
  "projects",
  "summary",
  "references",
  "achievements",
  "objective",
  "volunteer",
];

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

type NormalizedFileMetadata = {
  extension: string;
  normalizedMimeType: string;
};

export class UnsupportedCvFileTypeError extends Error {
  constructor() {
    super("Unsupported CV file type");
    this.name = "UnsupportedCvFileTypeError";
  }
}

export class CvFileTooLargeError extends Error {
  constructor() {
    super("CV file exceeds maximum size of 5 MB");
    this.name = "CvFileTooLargeError";
  }
}

class InvalidDocxFileError extends Error {
  constructor() {
    super("DOCX invalido ou corrompido");
    this.name = "InvalidDocxFileError";
  }
}

class InvalidOdtFileError extends Error {
  constructor() {
    super("ODT invalido ou corrompido");
    this.name = "InvalidOdtFileError";
  }
}

class CvExtractionTimeoutError extends Error {
  constructor() {
    super("Tempo limite de extracao do CV excedido");
    this.name = "CvExtractionTimeoutError";
  }
}

class NotACvError extends Error {
  constructor() {
    super("Uploaded file does not look like a CV");
    this.name = "NotACvError";
  }
}

export async function extractTextFromCvFile(file: UploadFile): Promise<string> {
  const { extension, normalizedMimeType } = validateCvFileEnvelope(file);

  if (normalizedMimeType === "application/pdf" || extension === ".pdf") {
    const { extractTextFromPdf } = await import("@earlycv/ai");
    return extractTextFromPdf(file.buffer, { validateCv: true });
  }

  if (
    normalizedMimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedMimeType === "application/octet-stream" ||
    extension === ".docx"
  ) {
    assertLooksLikeDocx(file.buffer);
    const result = await withTimeout(
      mammoth.extractRawText({ buffer: file.buffer }),
      EXTRACTION_TIMEOUT_MS,
    );
    return normalizeAndValidate(result.value);
  }

  if (
    normalizedMimeType === "application/vnd.oasis.opendocument.text" ||
    normalizedMimeType === "application/octet-stream" ||
    extension === ".odt"
  ) {
    assertLooksLikeOdt(file.buffer);
    const text = await convertWithLibreOfficeAndReadText(
      file.buffer,
      extension,
    );
    return normalizeAndValidate(text);
  }

  throw new UnsupportedCvFileTypeError();
}

export function validateCvFileEnvelope(file: UploadFile): NormalizedFileMetadata {
  if (!file?.buffer || file.buffer.length === 0) {
    throw new Error("Uploaded file is empty or unreadable");
  }

  if (file.buffer.length > MAX_CV_UPLOAD_BYTES) {
    throw new CvFileTooLargeError();
  }

  const extension = extname(file.originalname).toLowerCase();
  const normalizedMimeType = file.mimetype.trim().toLowerCase();

  if (!isFileTypeConsistent(normalizedMimeType, extension)) {
    throw new UnsupportedCvFileTypeError();
  }

  if (extension === ".docx") {
    assertLooksLikeDocx(file.buffer);
  }

  if (extension === ".odt") {
    assertLooksLikeOdt(file.buffer);
  }

  return { extension, normalizedMimeType };
}

function isFileTypeConsistent(mimeType: string, extension: string): boolean {
  if (extension === ".pdf") {
    return mimeType === "application/pdf";
  }

  if (extension === ".docx") {
    return [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ].includes(mimeType);
  }

  if (extension === ".odt") {
    return ["application/vnd.oasis.opendocument.text", "application/octet-stream"].includes(mimeType);
  }

  return false;
}

function normalizeAndValidate(text: string): string {
  const normalized = text.trim();
  if (normalized.length < MIN_CV_CHARS || !looksLikeCv(normalized)) {
    throw new NotACvError();
  }
  return normalized.slice(0, MAX_CV_CHARS);
}

function looksLikeCv(text: string): boolean {
  const lower = text.toLowerCase();
  const ptMatches = CV_SIGNALS_PT.filter((s) => lower.includes(s)).length;
  const enMatches = CV_SIGNALS_EN.filter((s) => lower.includes(s)).length;
  return ptMatches + enMatches >= 2;
}

async function convertWithLibreOfficeAndReadText(
  buffer: Buffer,
  extension: string,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "earlycv-cv-extract-"));
  const sourcePath = join(tempDir, `input${extension || ".doc"}`);
  const outputName = `${basename(sourcePath, extname(sourcePath))}.txt`;
  const outputPath = join(tempDir, outputName);

  await writeFile(sourcePath, buffer);
  try {
    await withTimeout(
      execLibreOfficeConvertToText(sourcePath, tempDir),
      EXTRACTION_TIMEOUT_MS,
    );
    return await withTimeout(readFile(outputPath, "utf8"), EXTRACTION_TIMEOUT_MS);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function execLibreOfficeConvertToText(
  sourcePath: string,
  outputDir: string,
) {
  const candidates = [
    process.env.LIBREOFFICE_BINARY?.trim(),
    "soffice",
    "libreoffice",
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
    "/usr/lib/libreoffice/program/soffice",
    "/snap/bin/libreoffice",
  ].filter((value): value is string => Boolean(value && value.length > 0));

  let lastError: unknown = null;
  for (const binary of [...new Set(candidates)]) {
    try {
      await execFileAsync(binary, [
        "--headless",
        "--convert-to",
        "txt:Text",
        "--outdir",
        outputDir,
        sourcePath,
      ]);
      return;
    } catch (error) {
      lastError = error;
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") break;
    }
  }

  throw new Error(
    `Falha ao ler arquivo DOCX/ODT no servidor: ${
      lastError instanceof Error ? lastError.message : "erro desconhecido"
    }`,
  );
}

function looksLikeZip(buffer: Buffer) {
  return buffer.length >= 4 && buffer.subarray(0, 2).toString("ascii") === "PK";
}

function assertLooksLikeDocx(buffer: Buffer): void {
  if (!looksLikeZip(buffer)) {
    throw new InvalidDocxFileError();
  }

  const hasContentTypes = includesAscii(buffer, "[Content_Types].xml");
  const hasWordDocument = includesAscii(buffer, "word/document.xml");

  if (!hasContentTypes || !hasWordDocument) {
    throw new InvalidDocxFileError();
  }
}

function assertLooksLikeOdt(buffer: Buffer): void {
  if (!looksLikeZip(buffer)) {
    throw new InvalidOdtFileError();
  }

  const hasMimeTypeEntry = includesAscii(buffer, "mimetype");
  const hasOdtMime = includesAscii(
    buffer,
    "application/vnd.oasis.opendocument.text",
  );
  const hasContentXml = includesAscii(buffer, "content.xml");

  if (!hasMimeTypeEntry || !hasOdtMime || !hasContentXml) {
    throw new InvalidOdtFileError();
  }
}

function includesAscii(buffer: Buffer, text: string): boolean {
  return buffer.includes(Buffer.from(text, "ascii"));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new CvExtractionTimeoutError());
    }, timeoutMs);
    timeoutRef.unref?.();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutRef) {
      clearTimeout(timeoutRef);
    }
  }
}
