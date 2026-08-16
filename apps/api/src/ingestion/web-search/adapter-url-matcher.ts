// Reconhece se uma URL de resultado de busca aponta pra um board de vagas
// de um adapter conhecido — usado pela Descoberta de Empresas pra validar
// resultados de "{empresa} vagas" antes de sugerir como candidato a probe.
// Os padroes de hostname/path espelham os `extractSlug`/`parseWorkdaySourceUrl`
// privados de cada adapter (ver apps/api/src/ingestion/adapters/*.ts) — nao
// precisam ser identicos byte a byte, so precisam gerar uma URL que o
// adapter real consiga re-parsear no probe.
//
// Talentbrew fica de fora de proposito: nao tem dominio fixo (qualquer
// hostname pode ser um site Talentbrew), entao nao da pra reconhecer so
// pela URL sem falso positivo alto.
export type ResolvedAdapterUrl = {
  careersUrl: string;
  sourceType: "ashby" | "greenhouse" | "gupy" | "inhire" | "lever" | "teamtailor" | "workday";
};

// Dominios reconhecidos por matchAdapterUrl — usado pra restringir a busca
// web (query com `site:`) só a paginas hospedadas num desses adapters, em
// vez de deixar o motor de busca livre pra devolver a pagina institucional
// de carreiras da empresa (que costuma rankear acima do board de ATS de
// verdade e nunca bate nenhum dos regexes abaixo).
export const ATS_SEARCH_DOMAINS = [
  "gupy.io",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "inhire.app",
  "teamtailor.com",
  "myworkdayjobs.com",
];

function firstPathSegment(pathname: string) {
  return pathname.split("/").filter(Boolean)[0];
}

export function matchAdapterUrl(rawUrl: string): ResolvedAdapterUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  const gupyMatch = hostname.match(/^([a-z0-9-]+)\.gupy\.io$/);
  if (gupyMatch?.[1]) {
    return { careersUrl: `https://${gupyMatch[1]}.gupy.io`, sourceType: "gupy" };
  }

  if (hostname === "boards.greenhouse.io" || hostname === "job-boards.greenhouse.io") {
    const slug = firstPathSegment(parsed.pathname);
    if (slug) {
      return { careersUrl: `https://boards.greenhouse.io/${slug}`, sourceType: "greenhouse" };
    }
  }

  if (hostname === "jobs.lever.co") {
    const slug = firstPathSegment(parsed.pathname);
    if (slug) {
      return { careersUrl: `https://jobs.lever.co/${slug}`, sourceType: "lever" };
    }
  }

  if (hostname === "jobs.ashbyhq.com") {
    const slug = firstPathSegment(parsed.pathname);
    if (slug) {
      return { careersUrl: `https://jobs.ashbyhq.com/${slug}`, sourceType: "ashby" };
    }
  }

  const inhireMatch = hostname.match(/^([a-z0-9-]+)\.inhire\.app$/);
  if (inhireMatch?.[1]) {
    return { careersUrl: `https://${inhireMatch[1]}.inhire.app`, sourceType: "inhire" };
  }

  const teamtailorMatch = hostname.match(/^([a-z0-9-]+)\.teamtailor\.com$/);
  if (teamtailorMatch?.[1]) {
    return { careersUrl: `https://${teamtailorMatch[1]}.teamtailor.com`, sourceType: "teamtailor" };
  }

  const workdayMatch = hostname.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (workdayMatch) {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const site = segments[segments.length - 1];
    if (site) {
      return {
        careersUrl: `https://${hostname}/${segments.join("/")}`,
        sourceType: "workday",
      };
    }
  }

  return null;
}
