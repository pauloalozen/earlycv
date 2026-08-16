import type { JobSourceType } from "@prisma/client";
import { normalizeCompanyName } from "./name-normalization";

// Adapters com padrao de slug simples e "adivinhavel" a partir do nome da
// empresa ({slug}.provedor.com ou provedor.com/{slug}) — Workday exige um
// numero de instance arbitrario por empresa (wd1, wd3, wd501...) e
// Talentbrew nao tem subdominio fixo nenhum, entao os dois ficam de fora
// do chute (so entram na validacao quando ja sabemos a URL de verdade).
export const GUESSABLE_ADAPTERS = [
  "gupy",
  "greenhouse",
  "lever",
  "ashby",
  "inhire",
  "teamtailor",
] as const satisfies readonly JobSourceType[];

export type GuessableAdapter = (typeof GUESSABLE_ADAPTERS)[number];

// Palavras genericas que costumam sobrar depois de normalizar razao
// social (S.A., Ltda...) e que não fazem parte do slug real da empresa.
const NOISE_WORDS = new Set([
  "s",
  "a",
  "sa",
  "ltda",
  "eireli",
  "me",
  "epp",
  "grupo",
  "group",
]);

export function generateSlugVariants(companyName: string): string[] {
  const hyphenated = normalizeCompanyName(companyName);
  if (!hyphenated) return [];

  const words = hyphenated.split("-").filter(Boolean);
  const meaningfulWords = words.filter((word) => !NOISE_WORDS.has(word));
  const primaryWords = meaningfulWords.length > 0 ? meaningfulWords : words;

  const variants = new Set<string>();
  const addFromWords = (wordList: string[]) => {
    if (wordList.length === 0) return;
    variants.add(wordList.join(""));
    variants.add(wordList.join("-"));
  };

  addFromWords(words);
  addFromWords(primaryWords);
  // Cada palavra "significativa" isolada, nao so a primeira — o slug real
  // costuma ser só o nome fantasia, que nem sempre é a primeira palavra da
  // razão social (ex: "Banco Agibank" -> slug real é "agibank", não
  // "banco").
  if (primaryWords.length > 1) {
    for (const word of primaryWords) addFromWords([word]);
  }

  return [...variants].filter((slug) => slug.length >= 2);
}

export function buildCandidateUrl(
  adapter: GuessableAdapter,
  slug: string,
): string {
  switch (adapter) {
    case "gupy":
      return `https://${slug}.gupy.io`;
    case "greenhouse":
      return `https://boards.greenhouse.io/${slug}`;
    case "lever":
      return `https://jobs.lever.co/${slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
    case "inhire":
      return `https://${slug}.inhire.app`;
    case "teamtailor":
      return `https://${slug}.teamtailor.com`;
  }
}
