import pdfParse from "pdf-parse";

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
  "profissional",
  "cargo",
  "empresa",
  "trabalho",
  "currículo",
  "curriculo",
];

const CV_SIGNALS_EN = [
  "experience",
  "education",
  "skills",
  "work",
  "employment",
  "resume",
  "cv",
  "professional",
  "position",
  "company",
  "university",
  "degree",
  "certification",
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

    if (!text) {
      throw new Error("PDF contains no extractable text");
    }

    if (text.length < MIN_CV_CHARS) {
      throw new Error("PDF content is too short to be a valid resume");
    }

    if (options.validateCv && !looksLikeCv(text)) {
      throw new NotACvError();
    }

    return text.slice(0, MAX_CV_CHARS);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("PDF contains no extractable text") ||
        error.message.includes("too short") ||
        error instanceof NotACvError)
    ) {
      throw error;
    }
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
