// Nome de empresa e cargo para exibição. Compartilhado entre API (preenche
// Company.displayName e o payload público) e Web (fallback quando o
// payload não traz o nome já resolvido). O dado cru no banco não muda:
// Company.name continua sendo a chave de filtro e de slug.

const LEGAL_SUFFIX = /[\s,.-]+(ltda\.?|s\.?\/?a\.?|eireli|me|epp)$/i;
const LOWERCASE_CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e"]);

// "MOBLY ... LTDA - EM RECUPERACAO JUDICIAL": situação jurídica não é nome.
const JUDICIAL_RECOVERY_SUFFIX = /\s*[-,]\s*em recupera[cç][aã]o judicial\.?$/i;
// "LTDA" no meio do nome (o do fim sai em LEGAL_SUFFIX).
const LTDA_ANYWHERE = /(^|\s)ltda\.?(?=\s|$)/gi;

// Grafia oficial de marcas e siglas que a regra de caixa abaixo erraria
// ("TOTVS" virando "Totvs", "IFOOD" virando "Ifood"), e palavras de até 4
// letras que são nome e não sigla ("VALE" vira "Vale"; sem entrada aqui,
// até 4 letras fica em caixa alta). Chave: palavra em minúsculas e sem
// acento. Só se aplica a nome inteiro em caixa alta.
const COMPANY_WORD_OVERRIDES: Record<string, string> = {
  aacd: "AACD",
  ccee: "CCEE",
  cctvm: "CCTVM",
  cnpem: "CNPEM",
  ebac: "EBAC",
  ifood: "iFood",
  itau: "Itaú",
  neobpo: "NeoBPO",
  pagbank: "PagBank",
  pagseguro: "PagSeguro",
  tecban: "TecBan",
  tmsa: "TMSA",
  totvs: "TOTVS",
  yduqs: "YDUQS",
  ...Object.fromEntries(
    [
      "bens",
      "blip",
      "cana",
      "car",
      "care",
      "casa",
      "copa",
      "data",
      "deal",
      "domo",
      "elis",
      "eveo",
      "gera",
      "giro",
      "gupy",
      "ilia",
      "inco",
      "kuhn",
      "lynx",
      "mais",
      "nava",
      "nexa",
      "next",
      "nibo",
      "nike",
      "nita",
      "plus",
      "rent",
      "road",
      "rota",
      "rumo",
      "sons",
      "tech",
      "toky",
      "tupy",
      "vale",
      "vero",
      "vila",
      "vita",
      "zelo",
    ].map((word) => [word, word.charAt(0).toUpperCase() + word.slice(1)]),
  ),
};

// Trecho depois do ponto que é domínio ("IFOOD.COM"), não nome.
const DOMAIN_SEGMENTS = new Set(["com", "br", "net", "io"]);

function companyWordOverride(word: string): string | undefined {
  const key = word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return COMPANY_WORD_OVERRIDES[key];
}

// Company.name vem cru da ingestão — muitas vezes a razão social em caixa
// alta ("BTG PACTUAL HOLDING DE SEGUROS LTDA."). Para título e texto, tira
// o sufixo societário e, só quando o nome inteiro está em caixa alta,
// normaliza a caixa (siglas curtas como "BRQ" ficam como estão).
export function companyDisplayName(rawName: string): string {
  // Aspas soltas vindas da ingestão (ex.: `"tivit`). Apóstrofo entre
  // letras é parte do nome ("LET'S RENT A CAR") e fica.
  // Travessão vindo do dado ("Vivo – Áreas Técnicas") não entra em título:
  // vira vírgula.
  let name = rawName
    .replace(/["“”]/g, "")
    .replace(/(?<!\p{L})['‘’]|['‘’](?!\p{L})/gu, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  name = name.replace(JUDICIAL_RECOVERY_SUFFIX, "").trim();
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(name); i++) {
    name = name.replace(LEGAL_SUFFIX, "").trim();
  }
  name = name.replace(LTDA_ANYWHERE, "$1").replace(/\s+/g, " ").trim();
  if (!name) name = rawName.trim();
  if (name !== name.toUpperCase()) return name;
  return name
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower;
      // Cada trecho entre pontos segue a regra sozinho ("C.VALE" -> "C.Vale",
      // "IFOOD.COM" -> "iFood.com").
      return word
        .split(".")
        .map((segment, segmentIndex) =>
          segmentIndex > 0 && DOMAIN_SEGMENTS.has(segment.toLowerCase())
            ? segment.toLowerCase()
            : displayCompanyWord(segment),
        )
        .join(".");
    })
    .join(" ");
}

function displayCompanyWord(token: string): string {
  // Pontuação nas pontas ("(NIKE)") fica de fora da regra de caixa.
  const [, before = "", word = "", after = ""] =
    token.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u) ?? [];
  return `${before}${displayCompanyCore(word)}${after}`;
}

function displayCompanyCore(word: string): string {
  if (!word) return word;
  const override = companyWordOverride(word);
  if (override) return override;
  // Até 4 letras fica como veio (sigla: "BTG", "CPFL"). Na dúvida, manter a
  // caixa: sigla em minúscula parece erro, marca em caixa alta não.
  if (/^[a-z]{1,4}$/i.test(word) || /[&\d]/.test(word)) return word;
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Alguns ATS (Lever da CI&T) prefixam o título com o ID interno da vaga
// ("[Job-32186] Senior AI Developer"). A ingestão já grava sem o prefixo;
// a exibição tira de novo para vaga antiga ainda não corrigida.
const JOB_ID_PREFIX = /^\[Job-\d+\]\s*/i;

export function stripJobIdPrefix(title: string): string {
  return title.replace(JOB_ID_PREFIX, "").replace(/\s+/g, " ").trim();
}

// Termos técnicos com grafia própria. Chave: minúsculas e sem acento.
const JOB_TITLE_TERMS: Record<string, string> = {
  ai: "AI",
  bi: "BI",
  devops: "DevOps",
  ia: "IA",
  ios: "iOS",
  ml: "ML",
  qa: "QA",
  rh: "RH",
  sap: "SAP",
  sre: "SRE",
  ti: "TI",
  ui: "UI",
  ux: "UX",
};
const ROMAN_NUMERAL = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/;
const JOB_TITLE_CONNECTORS = new Set([
  "a",
  "ao",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "no",
  "o",
  "os",
  "ou",
  "para",
  "por",
]);

function jobTitleWord(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase();
  const key = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const term = JOB_TITLE_TERMS[key];
  if (term) return term;
  if (ROMAN_NUMERAL.test(key)) return word.toUpperCase();
  if (!isFirst && JOB_TITLE_CONNECTORS.has(key)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Cargo inteiro em caixa alta ("ANALISTA DE BI SR") vira caixa de título
// ("Analista de BI Sr"). Cargo com caixa mista fica como veio.
export function formatJobTitle(title: string): string {
  const clean = stripJobIdPrefix(title);
  if (!/\p{L}/u.test(clean) || clean !== clean.toUpperCase()) return clean;
  let isFirst = true;
  return clean.replace(/\p{L}+/gu, (word) => {
    const formatted = jobTitleWord(word, isFirst);
    isFirst = false;
    return formatted;
  });
}
