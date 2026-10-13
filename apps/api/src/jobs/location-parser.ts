import { IBGE_MUNICIPIOS_BY_UF } from "./data/ibge-municipios";

// Parser de localização de vaga (PR 2b, item 7). Os ATS mandam a
// localização em texto livre e sujo ("São Paulo ou Rio de Janeiro",
// "BR-CWB-009", "BRA - Home Based - Sao Paulo", "Taboão Da Serra"); daqui
// sai a lista de cidades reconhecidas (até 3), com a grafia oficial do
// IBGE e a UF. Sem cidade reconhecida a lista fica vazia: quem chama usa
// só o país.

export type ParsedCity = { city: string; state: string };

export const MAX_PARSED_CITIES = 3;

function lookupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// nome normalizado -> municípios com esse nome (240 nomes se repetem
// entre estados: "Alvorada", "Aparecida", "São Domingos"...).
const CITIES_BY_KEY = new Map<string, ParsedCity[]>();
let LONGEST_NAME_WORDS = 1;
for (const [state, names] of Object.entries(IBGE_MUNICIPIOS_BY_UF)) {
  for (const city of names.split("|")) {
    const key = lookupKey(city);
    const list = CITIES_BY_KEY.get(key) ?? [];
    list.push({ city, state });
    CITIES_BY_KEY.set(key, list);
    LONGEST_NAME_WORDS = Math.max(LONGEST_NAME_WORDS, key.split(" ").length);
  }
}

const STATE_BY_NAME_KEY = new Map<string, string>(
  Object.entries({
    AC: "Acre",
    AL: "Alagoas",
    AP: "Amapá",
    AM: "Amazonas",
    BA: "Bahia",
    CE: "Ceará",
    DF: "Distrito Federal",
    ES: "Espírito Santo",
    GO: "Goiás",
    MA: "Maranhão",
    MT: "Mato Grosso",
    MS: "Mato Grosso do Sul",
    MG: "Minas Gerais",
    PA: "Pará",
    PB: "Paraíba",
    PR: "Paraná",
    PE: "Pernambuco",
    PI: "Piauí",
    RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte",
    RS: "Rio Grande do Sul",
    RO: "Rondônia",
    RR: "Roraima",
    SC: "Santa Catarina",
    SP: "São Paulo",
    SE: "Sergipe",
    TO: "Tocantins",
  }).map(([sigla, name]) => [lookupKey(name), sigla]),
);
const UF_SIGLAS = new Set(STATE_BY_NAME_KEY.values());

// Nome de estado que também é nome de município ("Espírito Santo" no RN,
// "Paraná" no RN, "Goiás" em GO): no texto de vaga é o estado. São Paulo e
// Rio de Janeiro ficam de fora: aí o texto quase sempre é a capital.
const STATE_NAME_IS_CITY = new Set([
  lookupKey("São Paulo"),
  lookupKey("Rio de Janeiro"),
]);

// Códigos de aeroporto (IATA) que as empresas usam como código de
// escritório ("BR-CWB-009", "POA05", "(SAO)"). Só valem em maiúsculas.
const IATA_CITIES: Record<string, ParsedCity> = {
  BHZ: { city: "Belo Horizonte", state: "MG" },
  BSB: { city: "Brasília", state: "DF" },
  CPQ: { city: "Campinas", state: "SP" },
  CWB: { city: "Curitiba", state: "PR" },
  FLN: { city: "Florianópolis", state: "SC" },
  FOR: { city: "Fortaleza", state: "CE" },
  POA: { city: "Porto Alegre", state: "RS" },
  REC: { city: "Recife", state: "PE" },
  RIO: { city: "Rio de Janeiro", state: "RJ" },
  SAO: { city: "São Paulo", state: "SP" },
  SSA: { city: "Salvador", state: "BA" },
};

const CAPITALS = new Set([
  "Aracaju/SE",
  "Belém/PA",
  "Belo Horizonte/MG",
  "Boa Vista/RR",
  "Brasília/DF",
  "Campo Grande/MS",
  "Cuiabá/MT",
  "Curitiba/PR",
  "Florianópolis/SC",
  "Fortaleza/CE",
  "Goiânia/GO",
  "João Pessoa/PB",
  "Macapá/AP",
  "Maceió/AL",
  "Manaus/AM",
  "Natal/RN",
  "Palmas/TO",
  "Porto Alegre/RS",
  "Porto Velho/RO",
  "Recife/PE",
  "Rio Branco/AC",
  "Rio de Janeiro/RJ",
  "Salvador/BA",
  "São Luís/MA",
  "São Paulo/SP",
  "Teresina/PI",
  "Vitória/ES",
]);

function stateHints(original: string, normalizedTokens: string[]): Set<string> {
  const hints = new Set<string>();
  for (const token of original.match(/(?<![A-Za-z])[A-Z]{2}(?![A-Za-z])/g) ??
    []) {
    if (UF_SIGLAS.has(token)) hints.add(token);
  }
  for (let size = 4; size >= 1; size--) {
    for (let i = 0; i + size <= normalizedTokens.length; i++) {
      const sigla = STATE_BY_NAME_KEY.get(
        normalizedTokens.slice(i, i + size).join(" "),
      );
      if (sigla) hints.add(sigla);
    }
  }
  return hints;
}

function pickCandidate(
  candidates: ParsedCity[],
  hints: Set<string>,
): ParsedCity | null {
  const hinted = candidates.filter((candidate) => hints.has(candidate.state));
  // Texto cita UF e o único município com esse nome é de outra UF: é
  // bairro ("Pinheiros, SP" não é Pinheiros/ES). Capital passa.
  if (candidates.length === 1) {
    const only = candidates[0] ?? null;
    if (!only || hints.size === 0 || hinted.length === 1) return only;
    return CAPITALS.has(`${only.city}/${only.state}`) ? only : null;
  }
  if (hinted.length === 1) return hinted[0] ?? null;
  const capitals = (hinted.length > 0 ? hinted : candidates).filter((c) =>
    CAPITALS.has(`${c.city}/${c.state}`),
  );
  return capitals.length === 1 ? (capitals[0] ?? null) : null;
}

// Municípios cujo nome aparece em texto de vaga com outro sentido
// ("modelo híbrido", "Região Sul, Brasil") ou que são homônimos de lugar
// estrangeiro ("California", "Virginia"). Chave: lookupKey.
const NOT_A_CITY = new Set(
  [
    "buenos aires",
    "california",
    "carolina",
    "colombia",
    "florida",
    "modelo",
    "nantes",
    "sul brasil",
    "virginia",
  ].map(lookupKey),
);

// Palavra antes do nome que indica bairro, rua ou unidade, não cidade
// ("Vila Olímpia", "Unidade Lins", "Brazil-Non Sao Paulo").
const NOT_A_CITY_PREFIX = new Set([
  "av",
  "avenida",
  "bairro",
  "jardim",
  "non",
  "parque",
  "rua",
  "unidade",
  "vila",
]);

type ParsedText = { matches: Match[]; isList: boolean };

// O DF tem um município só: região administrativa no campo city
// ("Taguatinga", "Lago Sul", "Guará") é Brasília.
function federalDistrictCity(
  state: string | null | undefined,
): ParsedCity | null {
  return state?.trim().toUpperCase() === "DF"
    ? { city: "Brasília", state: "DF" }
    : null;
}

function parseText(text: string): ParsedText {
  // ";", "|" e " / " separam opções ("São Paulo-SP / Rio de Janeiro-RJ").
  // Barra sem espaço fica: "São José dos Pinhais/PR", "Buritis/Santa Lúcia".
  const original = text.replace(/\s*[;|]\s*|\s+\/\s+/g, " ou ");
  const tokens = lookupKey(original).split(" ").filter(Boolean);
  const hints = stateHints(original, tokens);
  const found: Match[] = [];

  for (let i = 0; i < tokens.length; ) {
    let matched = 0;
    for (
      let size = Math.min(LONGEST_NAME_WORDS, tokens.length - i);
      size >= 1;
      size--
    ) {
      const key = tokens.slice(i, i + size).join(" ");
      // Nome de estado é consumido inteiro ("Santa Catarina" não vira
      // "Catarina"/CE); só São Paulo e Rio de Janeiro seguem como cidade.
      if (STATE_BY_NAME_KEY.has(key) && !STATE_NAME_IS_CITY.has(key)) {
        matched = size;
        break;
      }
      const candidates = CITIES_BY_KEY.get(key);
      if (!candidates) continue;
      matched = size;
      if (NOT_A_CITY.has(key) || NOT_A_CITY_PREFIX.has(tokens[i - 1] ?? "")) {
        break;
      }
      const city = pickCandidate(candidates, hints);
      if (city) {
        found.push({
          city,
          end: i + size,
          isStateName: STATE_NAME_IS_CITY.has(key),
          start: i,
        });
      }
      break;
    }
    i += matched || 1;
  }

  // Códigos IATA entram na posição em que aparecem no texto, para a ordem
  // da lista seguir a do texto.
  for (const match of original.matchAll(/(?<![A-Za-z])([A-Z]{3})(?![a-z])/g)) {
    const city = IATA_CITIES[match[1] ?? ""];
    if (!city) continue;
    const before = lookupKey(original.slice(0, match.index ?? 0));
    const start = before ? before.split(" ").length : 0;
    found.push({ city, end: start + 1, isStateName: false, start });
  }

  const ordered = dedupe(found.sort((a, b) => a.start - b.start));
  if (ordered.length <= 1) return { isList: false, matches: ordered };

  // Lista de verdade só com conector entre as cidades ("São Paulo ou Rio
  // de Janeiro", "Curitiba e Joinville"). Sem conector o texto é
  // hierárquico ("Campinas, São Paulo", "Brazil - Sao Paulo - Pinheiros",
  // "Recife, Armazem 9"): fica uma cidade só.
  if (hasListConnector(tokens, ordered)) {
    return { isList: true, matches: ordered };
  }
  return { isList: false, matches: [pickHierarchical(ordered, hints)] };
}

// Cidades da vaga, na ordem do texto, até MAX_PARSED_CITIES. A cidade do
// campo city (quando reconhecida) vem primeiro; o texto livre só acrescenta
// cidades quando é uma lista ("São Paulo, SP, BR - ou Campinas"), nunca
// bairro ou endereço ("São Paulo, SP, BR - Vila Olímpia").
export function parseJobLocations(input: {
  city?: string | null;
  country?: string | null;
  locationText?: string | null;
  state?: string | null;
}): ParsedCity[] {
  const fieldText = [input.city, input.state]
    .filter((value): value is string => !!value?.trim())
    .join(", ");
  const primary = fieldText
    ? (parseText(fieldText).matches[0]?.city ??
      federalDistrictCity(input.state))
    : null;

  const freeText = [input.locationText, input.country]
    .filter((value): value is string => !!value?.trim())
    .join(", ");
  const parsed = freeText ? parseText(freeText) : null;

  const result: ParsedCity[] = primary ? [primary] : [];
  const extra = parsed
    ? primary && !parsed.isList
      ? []
      : parsed.matches.map((match) => match.city)
    : [];
  for (const city of extra) {
    if (result.length === MAX_PARSED_CITIES) break;
    if (
      result.some(
        (item) => item.city === city.city && item.state === city.state,
      )
    ) {
      continue;
    }
    result.push(city);
  }
  return result;
}

type Match = {
  city: ParsedCity;
  end: number;
  // "São Paulo"/"Rio de Janeiro": pode ser a cidade ou o estado.
  isStateName: boolean;
  start: number;
};

const LIST_CONNECTORS = new Set(["ou", "e", "or", "and"]);

function dedupe(matches: Match[]): Match[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.city.city}/${match.city.state}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Conector entre a primeira e a última cidade, ou logo depois da última
// ("São Paulo, Rio de Janeiro ou Teletrabalho").
function hasListConnector(tokens: string[], matches: Match[]): boolean {
  const first = matches[0];
  const last = matches[matches.length - 1];
  if (!first || !last) return false;
  return tokens
    .slice(first.end, last.end + 2)
    .some((token) => LIST_CONNECTORS.has(token));
}

// Texto hierárquico: a cidade mais específica. Nome de estado ("São Paulo"
// em "Campinas, São Paulo") perde para outra cidade; cidade de outra UF
// que a citada no texto ("Pinheiros", ES, em "Sao Paulo - Pinheiros")
// perde para a que bate; no empate, a primeira.
function pickHierarchical(matches: Match[], hints: Set<string>): Match {
  const specific = matches.filter((match) => !match.isStateName);
  const pool = specific.length > 0 ? specific : matches;
  const hinted =
    hints.size > 0 ? pool.filter((match) => hints.has(match.city.state)) : [];
  if (hinted.length > 0) return hinted[0] as Match;
  if (hints.size > 0 && specific.length > 0) {
    const stateName = matches.find((match) => match.isStateName);
    if (stateName) return stateName;
  }
  return pool[0] as Match;
}
