// Normalização e extração determinística (regex) de sinais de identidade a
// partir de texto de CV — fase 1 da Base de Talentos (ver AGENTS.md "v3.2").
// Sem IA aqui: a extração rica (experiências, formação, idiomas) é fase 2.
//
// textSha256/professionalProfileFingerprint (AnalysisCvSnapshot) são hash de
// CONTEÚDO, nunca usados aqui como identidade de pessoa — este arquivo é a
// única fonte de sinais de identidade (email/telefone/LinkedIn/nome).

const KNOWN_TECHNICAL_SKILLS = [
  "sql",
  "python",
  "excel",
  "power bi",
  "tableau",
  "javascript",
  "typescript",
  "aws",
  "airflow",
  "dbt",
];

// Só varre as primeiras linhas não vazias do CV (onde contato normalmente
// aparece) — evita falso positivo pegando um e-mail citado no meio de uma
// vaga colada ou de uma experiência profissional.
const CONTACT_HEADER_LINES = 30;

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_REGEX = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/;
const LINKEDIN_REGEX =
  /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_.%]+\/?/i;
const NAME_LINE_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ'\-\s]{3,80}$/;

export function normalizeSnapshotText(input: string): string {
  return input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
}

export function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

// Mantém só dígitos, remove DDI 55 quando presente, e valida DDD+número
// (10-11 dígitos). Números com menos dígitos são ruído (ramal, CEP colado
// no texto etc.) e não viram sinal de identidade.
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

// Extrai só o slug /in/{slug} — descarta protocolo, www, trailing slash e
// query string, para que variações de URL do mesmo perfil normalizem igual.
export function normalizeLinkedinHandle(
  raw: string | undefined | null,
): string | null {
  if (!raw) return null;
  const match = raw.match(/linkedin\.com\/in\/([A-Za-z0-9\-_.%]+)/i);
  if (!match) return null;
  return match[1].toLowerCase().replace(/\/+$/, "");
}

export type ExtractedContactSignals = {
  fullName?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  skills: string[];
};

export function extractContactSignalsFromText(
  rawText: string,
): ExtractedContactSignals {
  const text = normalizeSnapshotText(rawText);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerText = lines.slice(0, CONTACT_HEADER_LINES).join("\n");
  const firstLine = lines[0];

  const emailMatch = headerText.match(EMAIL_REGEX);
  const phoneMatch = headerText.match(PHONE_REGEX);
  const linkedinMatch = headerText.match(LINKEDIN_REGEX);

  const lowered = text.toLowerCase();
  const skills = KNOWN_TECHNICAL_SKILLS.filter((skill) =>
    lowered.includes(skill),
  );

  return {
    fullName:
      firstLine && NAME_LINE_REGEX.test(firstLine) ? firstLine : undefined,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    linkedinUrl: linkedinMatch?.[0],
    skills,
  };
}
