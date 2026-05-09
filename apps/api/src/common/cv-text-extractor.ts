import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);
const MIN_CV_CHARS = 100;
const MAX_CV_CHARS = 30_000;
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

export class UnsupportedCvFileTypeError extends Error {
  constructor() {
    super("Unsupported CV file type");
    this.name = "UnsupportedCvFileTypeError";
  }
}

class NotACvError extends Error {
  constructor() {
    super("Uploaded file does not look like a CV");
    this.name = "NotACvError";
  }
}

export async function extractTextFromCvFile(file: UploadFile): Promise<string> {
  const extension = extname(file.originalname).toLowerCase();

  if (file.mimetype === "application/pdf" || extension === ".pdf") {
    const { extractTextFromPdf } = await import("@earlycv/ai");
    return extractTextFromPdf(file.buffer, { validateCv: true });
  }

  if (
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeAndValidate(result.value);
  }

  if (
    file.mimetype === "application/msword" ||
    file.mimetype === "application/vnd.oasis.opendocument.text" ||
    extension === ".doc" ||
    extension === ".odt"
  ) {
    const text = await convertWithLibreOfficeAndReadText(
      file.buffer,
      extension,
    );
    return normalizeAndValidate(text);
  }

  throw new UnsupportedCvFileTypeError();
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
    await execLibreOfficeConvertToText(sourcePath, tempDir);
    return await readFile(outputPath, "utf8");
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
    `Falha ao ler arquivo DOC/DOCX/ODT no servidor: ${
      lastError instanceof Error ? lastError.message : "erro desconhecido"
    }`,
  );
}
