import pdfParse from "pdf-parse";

// Words that appear exclusively (or almost exclusively) in CVs/resumes.
// Deliberately excludes generic business words like "empresa", "profissional",
// "cargo", "company", "work" — those appear in receipts, invoices, contracts.
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

const MIN_CV_CHARS = 100;
const MAX_CV_CHARS = 30_000;
const MIN_CV_SIGNALS = 2;
const MAX_PDF_PAGES = 20;
const PDF_PARSE_TIMEOUT_MS = 8_000;

export class NotACvError extends Error {
  constructor() {
    super(
      "O arquivo enviado não parece ser um currículo. Por favor, envie um arquivo PDF com seu currículo profissional.",
    );
    this.name = "NotACvError";
  }
}

export class PasswordProtectedPdfError extends Error {
  constructor() {
    super(
      "Não foi possível ler o arquivo. Verifique se o PDF não está protegido por senha ou corrompido.",
    );
    this.name = "PasswordProtectedPdfError";
  }
}

export class ScannedPdfError extends Error {
  constructor() {
    super(
      "Não conseguimos ler o texto do PDF. Envie um arquivo com texto selecionável.",
    );
    this.name = "ScannedPdfError";
  }
}

export class InvalidPdfFormatError extends Error {
  constructor() {
    super("O arquivo enviado nao e um PDF valido.");
    this.name = "InvalidPdfFormatError";
  }
}

export class PdfTooLargeError extends Error {
  constructor() {
    super("O arquivo PDF excede o limite de tamanho permitido.");
    this.name = "PdfTooLargeError";
  }
}

export class PdfTooManyPagesError extends Error {
  constructor() {
    super("O PDF possui paginas demais para analise automatica.");
    this.name = "PdfTooManyPagesError";
  }
}

function looksLikeCv(text: string): boolean {
  const lower = text.toLowerCase();
  const ptMatches = CV_SIGNALS_PT.filter((s) => lower.includes(s)).length;
  const enMatches = CV_SIGNALS_EN.filter((s) => lower.includes(s)).length;
  return ptMatches + enMatches >= MIN_CV_SIGNALS;
}

export async function extractTextFromPdf(
  buffer: Buffer,
  options: { validateCv?: boolean } = {},
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("PDF buffer is empty or unreadable");
  }

  if (buffer.length > 5 * 1024 * 1024) {
    throw new PdfTooLargeError();
  }

  if (!looksLikePdf(buffer)) {
    throw new InvalidPdfFormatError();
  }

  try {
    const data = await Promise.race([
      pdfParse(buffer),
      createTimeoutPromise(PDF_PARSE_TIMEOUT_MS),
    ]);

    if (typeof data.numpages === "number" && data.numpages > MAX_PDF_PAGES) {
      throw new PdfTooManyPagesError();
    }

    const text = data.text.trim();

    if (!text || text.length < MIN_CV_CHARS) {
      throw new ScannedPdfError();
    }

    if (options.validateCv && !looksLikeCv(text)) {
      throw new NotACvError();
    }

    return text.slice(0, MAX_CV_CHARS);
  } catch (error) {
    if (
      error instanceof NotACvError ||
      error instanceof PasswordProtectedPdfError ||
      error instanceof ScannedPdfError ||
      error instanceof InvalidPdfFormatError ||
      error instanceof PdfTooLargeError ||
      error instanceof PdfTooManyPagesError
    ) {
      throw error;
    }
    throw new PasswordProtectedPdfError();
  }
}

function looksLikePdf(buffer: Buffer): boolean {
  if (buffer.length < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    const ref = setTimeout(() => {
      reject(new PasswordProtectedPdfError());
    }, timeoutMs);
    ref.unref?.();
  });
}
