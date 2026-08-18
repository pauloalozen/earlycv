// Normalização geográfica pra Job.state/Job.city, que chegam sujos dos
// crawlers (sigla vs nome por extenso vs variação de caixa/acento). Usado
// tanto na ingestão (antes de salvar) quanto nas facets públicas (pra
// mostrar nome por extenso no dropdown mesmo guardando sigla no banco).
// Sem dependência externa de propósito — só os 27 estados brasileiros,
// hardcoded.

export type NormalizedState = { sigla: string; nome: string };

const BRAZILIAN_STATES: NormalizedState[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeLookupKey(value: string): string {
  return stripDiacritics(value.trim().toLowerCase());
}

const STATE_NAME_BY_SIGLA = new Map<string, string>(
  BRAZILIAN_STATES.map((s) => [s.sigla, s.nome]),
);

const STATE_SIGLA_BY_NORMALIZED_NAME = new Map<string, string>(
  BRAZILIAN_STATES.map((s) => [normalizeLookupKey(s.nome), s.sigla]),
);

// Reaproveitado por normalizeCity: alguns nomes de estado (SP, RJ) também
// são o nome da capital/cidade mais comum ligada a essa vaga — cobre os
// casos citados na spec ("sao paulo" → "São Paulo") sem precisar de uma
// lista fechada de municípios, que está fora do escopo daqui.
const STATE_NAME_BY_NORMALIZED_NAME = new Map<string, string>(
  BRAZILIAN_STATES.map((s) => [normalizeLookupKey(s.nome), s.nome]),
);

export function normalizeState(
  state: string | null | undefined,
): NormalizedState | null {
  const trimmed = state?.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    const sigla = trimmed.toUpperCase();
    const nome = STATE_NAME_BY_SIGLA.get(sigla);
    if (nome) return { sigla, nome };
  }

  const key = normalizeLookupKey(trimmed);
  const sigla = STATE_SIGLA_BY_NORMALIZED_NAME.get(key);
  if (!sigla) return null;

  return { sigla, nome: STATE_NAME_BY_SIGLA.get(sigla) as string };
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function normalizeCity(city: string | null | undefined): string | null {
  const trimmed = city?.trim();
  if (!trimmed) return null;

  const key = normalizeLookupKey(trimmed);
  const matchedStateName = STATE_NAME_BY_NORMALIZED_NAME.get(key);
  if (matchedStateName) return matchedStateName;

  return titleCase(trimmed);
}

// "bra" cobre o código ISO 3166-1 alpha-3 (Gupy manda country="BRA", não
// "BR") — achado auditando rejeições reais do filtro (Hypera Pharma,
// Atento, PETZ e outras vagas BR legítimas estavam sendo descartadas por
// isso).
const BRAZIL_COUNTRY_NAMES = new Set(["brasil", "brazil", "br", "bra"]);

// Nomes/siglas de estado americano (USPS) — a fonte mais comum de vaga
// estrangeira vazando pro board "Brasil" dessas empresas globais
// (Greenhouse/Lever/Inhire não expõem country estruturado, então o
// adapter cai no fallback "Brasil" mesmo pra vaga da Califórnia; o `state`
// continua com o valor real da fonte e é o único sinal confiável nesse
// caso). Lista fechada e conservadora de propósito — objetivo é não gerar
// falso positivo (vaga BR real com state sujo, tipo "Remoto" ou "Brazil)",
// não pode ser barrada por engano).
const US_STATE_TOKENS = new Set(
  [
    "AL",
    "Alabama",
    "AK",
    "Alaska",
    "AZ",
    "Arizona",
    "AR",
    "Arkansas",
    "CA",
    "California",
    "CO",
    "Colorado",
    "CT",
    "Connecticut",
    "DE",
    "Delaware",
    "DC",
    "District of Columbia",
    "FL",
    "Florida",
    "GA",
    "Georgia",
    "HI",
    "Hawaii",
    "ID",
    "Idaho",
    "IL",
    "Illinois",
    "IN",
    "Indiana",
    "IA",
    "Iowa",
    "KS",
    "Kansas",
    "KY",
    "Kentucky",
    "LA",
    "Louisiana",
    "ME",
    "Maine",
    "MD",
    "Maryland",
    "MA",
    "Massachusetts",
    "MI",
    "Michigan",
    "MN",
    "Minnesota",
    "MS",
    "Mississippi",
    "MO",
    "Missouri",
    "MT",
    "Montana",
    "NE",
    "Nebraska",
    "NV",
    "Nevada",
    "NH",
    "New Hampshire",
    "NJ",
    "New Jersey",
    "NM",
    "New Mexico",
    "NY",
    "New York",
    "NC",
    "North Carolina",
    "ND",
    "North Dakota",
    "OH",
    "Ohio",
    "OK",
    "Oklahoma",
    "OR",
    "Oregon",
    "PA",
    "Pennsylvania",
    "RI",
    "Rhode Island",
    "SC",
    "South Carolina",
    "SD",
    "South Dakota",
    "TN",
    "Tennessee",
    "TX",
    "Texas",
    "UT",
    "Utah",
    "VT",
    "Vermont",
    "VA",
    "Virginia",
    "WA",
    "Washington",
    "WV",
    "West Virginia",
    "WI",
    "Wisconsin",
    "WY",
    "Wyoming",
    "Seattle",
    "San Francisco",
    "Mountain View",
  ].map(normalizeLookupKey),
);

// Nomes de país estrangeiro observados vazando no campo state (fontes que
// só têm um campo de "região" livre e não separam país). Conservador pelo
// mesmo motivo do US_STATE_TOKENS acima.
const FOREIGN_COUNTRY_TOKENS = new Set(
  [
    "India",
    "Ireland",
    "Portugal",
    "Argentina",
    "Canada",
    "United Kingdom",
    "UK",
    "England",
    "France",
    "Poland",
    "Singapore",
    "Japan",
    "Mexico",
    "Colombia",
    "Australia",
    "Taiwan",
    "Netherlands",
    "Qatar",
    "Indonesia",
    "Malaysia",
    "Korea",
    "South Korea",
    "Thailand",
    "Costa Rica",
    "Panama",
    "Germany",
    "Spain",
    "Italy",
    "China",
    "Switzerland",
    "Sweden",
    "Israel",
    "Chile",
    "Peru",
  ].map(normalizeLookupKey),
);

function splitLocationTokens(value: string): string[] {
  return value
    .split(/[;|•,]/)
    .map((part) => normalizeLookupKey(part))
    .filter(Boolean);
}

// Sinal usado quando o adapter não trouxe country estruturado da fonte
// (undefined/vazio) — nesse caso o único jeito de saber que a vaga é
// estrangeira é o próprio texto de state bater com um estado americano ou
// nome de país conhecido. Não pega tudo (propositalmente conservador), só
// os casos claros vistos na base real.
export function isRecognizedForeignRegion(
  value: string | null | undefined,
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  const tokens = splitLocationTokens(trimmed);
  return tokens.some(
    (token) => US_STATE_TOKENS.has(token) || FOREIGN_COUNTRY_TOKENS.has(token),
  );
}

// Separadores observados em location composto de fonte real: "São Paulo ou
// Rio de Janeiro", "São Paulo e Rio de Janeiro", "São Paulo-SP / Rio de
// Janeiro-RJ", "São Paulo; Curitiba; Fortaleza".
function splitCountryTokens(value: string): string[] {
  return value
    .replace(/\s+ou\s+/gi, "|")
    .replace(/\s+e\s+/gi, "|")
    .split(/[/;,|•-]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Achado auditando rejeições reais do filtro: Greenhouse/Lever/Inhire não
// separam country estruturado, então quando a fonte manda um location de
// um token só (ex: "São Paulo", "Remoto", "Curitiba"), o parseLocation de
// cada adapter trata esse token como country (não como cidade) — BTG
// Pactual, Banco PAN, Braze Brasil e outras vagas BR reais estavam sendo
// descartadas por isso. Reconhece como Brasil quando o valor (ou algum
// token dele, em location composto) é "remoto"/"remote" ou bate com o NOME
// POR EXTENSO de uma UF brasileira (ex: "São Paulo").
//
// Propositalmente NÃO usa normalizeState() aqui (que também aceita sigla de
// 2 letras) — bug real encontrado em produção (LOUIS DREYFUS BR, board
// Lever global): posting.country="RO" (código ISO do país Romênia) colide
// com a sigla da UF Rondônia, então normalizeState("RO") retornava a UF e a
// vaga de Bucareste era aceita como brasileira. Sigla de 2 letras isolada
// (sem nome por extenso) é ambígua com dezenas de códigos ISO-3166-1
// alpha-2 (RO=Romênia, PA=Panamá, PE=Peru, SE=Suécia, TO=Tonga,
// AL=Albânia, MA=Marrocos, MT=Malta, BA=Bósnia, SC=Seicheles...) — quando o
// adapter manda country estruturado (Ashby/Teamtailor/Talentbrew/Workday/
// Lever via posting.country), esse valor é sempre um código de país real,
// nunca uma UF brasileira, então nunca deve ser resolvido via sigla.
function isBrazilianStateFullNameToken(token: string): boolean {
  const key = normalizeLookupKey(token);
  return STATE_SIGLA_BY_NORMALIZED_NAME.has(key);
}

function isBrazilianCountryValue(value: string): boolean {
  const key = normalizeLookupKey(value);
  if (BRAZIL_COUNTRY_NAMES.has(key) || key === "remoto" || key === "remote") {
    return true;
  }

  return splitCountryTokens(value).some((token) => {
    const tokenKey = normalizeLookupKey(token);
    return (
      tokenKey === "remoto" ||
      tokenKey === "remote" ||
      isBrazilianStateFullNameToken(token)
    );
  });
}

// Critério combinado pra decidir se uma observação de vaga é de fora do
// Brasil: country real (não-defaultado) manda quando presente — só é
// confiável nos adapters que pegam country estruturado da fonte (Ashby,
// Teamtailor, Talentbrew, Workday) ou quando o valor bate com Brasil/UF/
// "remoto" mesmo vindo do fallback de parseLocation (ver
// isBrazilianCountryValue). Quando country vem vazio, cai no fallback de
// state — só rejeita se bater com um estado americano ou país estrangeiro
// reconhecido, nunca só por "não é uma UF brasileira" (isso geraria falso
// positivo em vaga BR real com state sujo, ex: "Remoto", "Brazil)").
export function isForeignLocation(
  country: string | null | undefined,
  state: string | null | undefined,
): boolean {
  const trimmedCountry = country?.trim();
  if (trimmedCountry) {
    return !isBrazilianCountryValue(trimmedCountry);
  }

  return isRecognizedForeignRegion(state);
}
