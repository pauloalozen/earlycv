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

  try {
    const data = await pdfParse(buffer);
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
      error instanceof ScannedPdfError
    ) {
      throw error;
    }
    throw new PasswordProtectedPdfError();
  }
}
