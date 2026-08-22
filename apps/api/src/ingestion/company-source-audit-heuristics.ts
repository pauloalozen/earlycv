import { normalizeCompanyName } from "./name-normalization";

// Heuristico deterministico (sem IA) pra detectar Company/JobSource com URL
// de carreiras atribuida a empresa errada — ex: "VERACEL" (usina de celulose)
// com careersUrl apontando pro board de vagas da "Vercel" (empresa de infra
// de deploy). Usado por scripts/audit-company-sources.ts.
//
// A ideia: pra provedores de ATS globais (Greenhouse/Ashby/Lever), a
// identidade real da empresa mora no slug da URL (ex:
// boards.greenhouse.io/anthropic -> "anthropic"), nao no dominio (que e
// sempre do provedor). Pra provedores brasileiros com subdominio por
// cliente (Pandape/Teamtailor/Solides), a identidade mora no subdominio.
// Em ambos os casos comparamos essa "identidade" extraida da URL contra o
// nome da empresa dona do registro.

export const KNOWN_ATS_PLATFORM_HOSTS = [
  "gupy.io",
  "pandape.com.br",
  "pandape.infojobs.com.br",
  "inhire.app",
  "solides.com.br",
  "kenoby.com",
  "breezy.hr",
  "recrutai.com.br",
  "abler.com.br",
  "bebee.com",
  "indeed.com",
  "linkedin.com",
  "myworkdayjobs.com",
  "successfactors.com",
  "successfactors.eu",
  "sapsf.com",
  "catho.com.br",
  "trabalhabrasil.com.br",
  "empregos.com.br",
  "99jobs.com",
  "joinbe.com.br",
  "vagas.com.br",
  "vagas.com",
  "recruiter.com",
  "ashbyhq.com",
  "recrutamento.io",
  "jobvite.com",
  "icims.com",
  "taleo.net",
  "recrut.ai",
  "comeet.co",
  "teamtailor.com",
  "jobconvo.com",
  "quickin.io",
  "mindsight.com.br",
  "oraclecloud.com",
  "smartrecruiters.com",
  "peixe30.com",
  "lg.com.br",
  "greenhouse.io",
  "lever.co",
  // Genericos usados como plataforma de RH/hospedagem por empresas que
  // nao sao o provedor em si (ex: platform.senior.com.br hospeda vagas de
  // varios clientes da Senior Sistemas; buserbrasil.notion.site e a
  // Buser usando o Notion como pagina de carreiras) — o dominio nao
  // carrega identidade nenhuma do cliente.
  "senior.com.br",
  "notion.site",
] as const;

// Subdominios das plataformas listadas onde o identificador do cliente e o
// PRIMEIRO label do host (ex: fiesc.pandape.com.br -> "fiesc").
const ATS_SUBDOMAIN_HOSTS = [
  "teamtailor.com",
  "pandape.com.br",
  "pandape.infojobs.com.br",
  "solides.com.br",
  "gupy.io",
];

// Plataformas onde o identificador do cliente vem no PRIMEIRO segmento do
// path (ex: boards.greenhouse.io/anthropic -> "anthropic").
const ATS_PATH_HOSTS = [
  "boards.greenhouse.io",
  "boards-api.greenhouse.io",
  "job-boards.greenhouse.io",
  "greenhouse.io",
  "jobs.ashbyhq.com",
  "ashbyhq.com",
  "apply.workable.com",
  "workable.com",
  "jobs.kenoby.com",
  "kenoby.com",
  "jobs.lever.co",
  "api.lever.co",
  "lever.co",
  "jobs.quickin.io",
  "quickin.io",
  "jobs.peixe30.com",
  "peixe30.com",
  "oportunidades.mindsight.com.br",
  "app.jobconvo.com",
  "jobconvo.com",
];

// Palavras genericas que aparecem como slug/subdominio em vitrines de ATS e
// nao identificam empresa nenhuma (ex: "boards.teamtailor.com/career",
// "jobs.ashbyhq.com/careers") — nunca contam como sinal de identidade.
const GENERIC_SLUGS = new Set([
  "jobs",
  "careers",
  "career",
  "vagas",
  "boards",
  "board",
  "portaldetalentos",
  "platform",
  "recruiting",
  "talent",
  "apply",
]);

// Plataformas onde o slug/subdominio e, na pratica observada, sempre uma
// transliteracao literal do nome real da empresa (marcas internacionais
// conhecidas) — nessas, a AUSENCIA de semelhanca com o nome cadastrado e
// por si so um sinal forte de erro, mesmo sem achar o dono real no nosso
// banco (tier "high"/"review" do audit-company-sources.ts).
//
// Plataformas brasileiras com subdominio por cliente (Gupy, Pandape,
// Teamtailor, Solides) NAO entram aqui: e pratica comum o subdominio ser
// sigla, slogan de campanha ("venhasereletrobras") ou nome da operadora do
// grupo ("viavarejo" pro Grupo Casas Bahia) em vez do nome oficial da
// empresa — baixa semelhanca textual nao e sinal confiavel de erro nessas.
// Para essas plataformas, so o cruzamento com o nome de OUTRA empresa
// nossa (tier "confirmed") tem precisao suficiente pra virar achado.
export const STRICT_LITERAL_SLUG_HOSTS = [
  "greenhouse.io",
  "ashbyhq.com",
  "lever.co",
  "workable.com",
];

const COMPOUND_SUFFIXES = new Set([
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  "co.uk",
  "com.au",
  "co.jp",
]);

const NAME_STOPWORDS = new Set([
  "ltda",
  "sa",
  "me",
  "eireli",
  "servicos",
  "sistemas",
  "solutions",
  "consultoria",
  "comercio",
  "industria",
  "participacoes",
  "holding",
  "group",
  "grupo",
  "brasil",
  "brazil",
  "br",
  "tecnologia",
  "tecnologias",
  "informatica",
  "company",
  "co",
  "corp",
  "inc",
  "com",
  "careers",
  "e",
  "de",
  "do",
  "da",
  "dos",
  "das",
]);

export function normToken(value: string): string {
  return normalizeCompanyName(value).replace(/-/g, "");
}

export function hostRoot(rawUrl: string): string {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

function hostMatchesAny(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function isKnownAtsPlatformHost(host: string): boolean {
  return hostMatchesAny(host, KNOWN_ATS_PLATFORM_HOSTS);
}

export function isStrictLiteralSlugHost(host: string): boolean {
  return hostMatchesAny(host, STRICT_LITERAL_SLUG_HOSTS);
}

// Dominio registravel (ignora subdominio), tratando sufixos compostos como
// .com.br — "fiesc.pandape.com.br" -> "pandape.com.br"; "jobs.gerdau.com" ->
// "gerdau.com".
export function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length < 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (COMPOUND_SUFFIXES.has(last2) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return last2;
}

function registrableCore(host: string): string {
  const domain = registrableDomain(host);
  const parts = domain.split(".");
  const suffix2 = parts.slice(-2).join(".");
  if (COMPOUND_SUFFIXES.has(suffix2) && parts.length >= 3) {
    return parts[0] ?? domain;
  }
  return parts[0] ?? domain;
}

// Extrai o(s) token(s) de identidade da URL: nome do cliente no subdominio
// ou no primeiro segmento do path, dependendo da plataforma. Sempre inclui
// tambem o core do dominio registravel como candidato (cobre o caso de a
// propria empresa ter dominio proprio, ex: "jobs.gerdau.com" -> "gerdau").
export function identityTokens(rawUrl: string): string[] {
  const tokens = new Set<string>();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return [];
  }
  const host = hostRoot(rawUrl);
  if (!host) return [];

  // O core do dominio so e sinal de identidade quando a URL e o dominio
  // proprio da empresa (ex: jobs.gerdau.com -> "gerdau"). Numa plataforma de
  // ATS conhecida, o core e sempre o nome do PROVEDOR (greenhouse, gupy,
  // teamtailor...), nunca do cliente — nao deve entrar como candidato.
  if (!isKnownAtsPlatformHost(host)) {
    const core = normToken(registrableCore(host));
    if (core && core.length >= 3 && !GENERIC_SLUGS.has(core)) tokens.add(core);
  }

  if (hostMatchesAny(host, ATS_SUBDOMAIN_HOSTS)) {
    const sub = normToken(host.split(".")[0] ?? "");
    if (sub && sub.length >= 3 && !GENERIC_SLUGS.has(sub)) tokens.add(sub);
  }

  if (hostMatchesAny(host, ATS_PATH_HOSTS)) {
    const segments = url.pathname.split("/").filter(Boolean);
    let candidate: string | undefined = segments[0];
    // api.lever.co/v0/postings/<slug>
    if (host.startsWith("api.lever.co") && segments[0] === "v0") {
      candidate = segments[2];
    }
    // boards-api.greenhouse.io/v1/boards/<slug>/jobs
    if (host.startsWith("boards-api.greenhouse.io") && segments[0] === "v1") {
      const idx = segments.indexOf("boards");
      candidate = idx >= 0 ? segments[idx + 1] : undefined;
    }
    if (candidate) {
      const slug = normToken(decodeURIComponent(candidate));
      if (slug && slug.length >= 3 && !GENERIC_SLUGS.has(slug))
        tokens.add(slug);
    }
  }

  return [...tokens];
}

export function companyNameTokens(name: string): string[] {
  // normalizeCompanyName ja resolve acento/caixa/separadores (mesma funcao
  // usada pra deduplicar Company.normalizedName na ingestao).
  const slug = normalizeCompanyName(name);
  if (!slug) return [];
  return slug
    .split("-")
    .filter((token) => !NAME_STOPWORDS.has(token) && token.length >= 2);
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.max(
      0.8,
      Math.min(a.length, b.length) / Math.max(a.length, b.length),
    );
  }
  const dice = diceCoefficient(a, b);
  // Achado durante a calibracao deste heuristico: bigrama sozinho
  // superestima colisao de grafia entre empresas DIFERENTES (o proprio
  // caso "VERACEL" x "vercel" da ~0.73 de dice sem ser a mesma coisa) —
  // sem esse amortecimento, o exemplo que motivou esta auditoria nao
  // seria pego pela via de auto-similaridade. So conta como sinal forte
  // quando o overlap de bigramas e muito alto (>=0.85); abaixo disso vira
  // sinal fraco, nunca o suficiente sozinho pra passar de MATCH_THRESHOLD.
  return dice >= 0.85 ? dice : dice * 0.6;
}

// Coeficiente de Sorensen-Dice sobre bigramas — barato, sem dependencia
// externa, e da resultado equivalente ao SequenceMatcher usado na
// investigacao manual original para o caso de uso (nomes curtos, sem
// necessidade de alinhamento fonetico).
function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const mapA = bigrams(a);
  const mapB = bigrams(b);
  let intersection = 0;
  for (const [bg, countA] of mapA) {
    const countB = mapB.get(bg);
    if (countB) intersection += Math.min(countA, countB);
  }
  const totalBigrams = a.length - 1 + (b.length - 1);
  return totalBigrams === 0 ? 0 : (2 * intersection) / totalBigrams;
}

export type UrlCompanyMatch = {
  /** Melhor similaridade [0,1] entre a identidade da URL e o nome da empresa. */
  score: number;
  /** Token de identidade extraido da URL que gerou o melhor score. */
  matchedToken: string | null;
};

// Compara a(s) identidade(s) extraida(s) da URL com os tokens do nome da
// empresa e retorna o melhor score. score=0 quando a URL nao tem identidade
// extraivel (ex: plataforma desconhecida sem padrao definido) — nesse caso
// o chamador deve tratar como "sem sinal", nao como "confirmadamente
// errado".
export function scoreUrlAgainstCompany(
  rawUrl: string,
  companyName: string,
): UrlCompanyMatch {
  const tokens = identityTokens(rawUrl);
  const nameTokens = companyNameTokens(companyName);
  const nameFull = normToken(companyName);

  let best = 0;
  // bestToken e o token de identidade da URL com a MAIOR similaridade ao
  // nome da empresa — mesmo quando essa similaridade e 0 (ex: "ufra" x
  // "anthropic"), ainda precisamos saber QUAL token da URL usar pra
  // cruzar contra outras empresas do banco (tier "confirmed"). So fica
  // null quando a URL nao tem identidade nenhuma extraivel.
  let bestToken: string | null = tokens[0] ?? null;
  for (const token of tokens) {
    let tokenBest = similarity(token, nameFull);
    for (const nameToken of nameTokens) {
      tokenBest = Math.max(tokenBest, similarity(token, nameToken));
    }
    if (tokenBest > best) {
      best = tokenBest;
      bestToken = token;
    }
  }

  return { score: best, matchedToken: bestToken };
}

// Calibrado manualmente contra os 1.693 JobSource de producao existentes em
// 2026-08-22: score >= 0.6 cobre os casos com relacao textual real (mesmo
// com sufixo tipo "Brasil"/"(Workday)"); abaixo disso, nos dados
// observados, a URL nao tinha nenhuma relacao plausivel com o nome.
export const MATCH_THRESHOLD = 0.6;

// Duas URLs sao o "mesmo board" quando compartilham pelo menos um token de
// identidade — cobre diferenca cosmetica que uma comparacao de string exata
// erra: barra final, maiusculas ("Linear" x "linear"), ou o dominio do
// provedor ter mudado (Greenhouse migrou de "boards.greenhouse.io" pra
// "job-boards.greenhouse.io" mas o slug da empresa e o mesmo). Usado pelo
// apply da auditoria (CompanySourceAuditService) pra achar se a empresa
// dona real ja tem uma fonte cadastrada pro MESMO board, mesmo que a URL
// nao seja identica caractere por caractere.
export function isSameBoard(urlA: string, urlB: string): boolean {
  const tokensA = new Set(identityTokens(urlA));
  const tokensB = identityTokens(urlB);
  return tokensB.some((token) => tokensA.has(token));
}
