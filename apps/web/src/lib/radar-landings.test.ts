import { describe, expect, it } from "vitest";

import {
  areaLanding,
  companyDisplayName,
  companyLanding,
  jobLandingLinks,
  landingFaq,
  landingIntro,
  landingRelatedLinks,
  landingSeoDescription,
  landingSeoTitle,
  listEligibleLandings,
  type RadarLandingIndex,
  type RadarLandingSummary,
  remoteLanding,
  resolveTechnologySlug,
  technologyLabel,
  technologyLanding,
  toTechnologySlug,
} from "./radar-landings";

const INDEX: RadarLandingIndex = {
  total: 500,
  areas: [
    { value: "DATA_AI", count: 200 },
    { value: "DESIGN_UX", count: 3 },
    { value: "OTHER", count: 50 },
  ],
  seniorities: [
    { value: "JUNIOR", count: 60 },
    { value: "INTERN", count: 4 },
  ],
  workModels: [{ value: "remote", count: 150 }],
  companies: [
    { name: "STEFANINI LTDA", slug: "stefanini-ltda", count: 40 },
    { name: "Pequena", slug: "pequena", count: 2 },
  ],
  technologies: [
    { value: "python", count: 120 },
    { value: "power bi", count: 30 },
    { value: "c#", count: 12 },
  ],
  cities: [
    {
      city: "São Paulo",
      state: "SP",
      stateName: "São Paulo",
      slug: "sao-paulo-sp",
      count: 90,
    },
  ],
  areaWorkModels: [{ a: "DATA_AI", b: "remote", count: 70 }],
  areaSeniorities: [{ a: "DATA_AI", b: "JUNIOR", count: 4 }],
  seniorityWorkModels: [{ a: "INTERN", b: "remote", count: 1 }],
};

const SUMMARY: RadarLandingSummary = {
  total: 1338,
  latestAt: "2026-10-06T12:00:00.000Z",
  newLast7Days: 203,
  companies: [
    { name: "CI&T", slug: "cit", count: 141 },
    { name: "STEFANINI LTDA", slug: "stefanini-ltda", count: 81 },
    {
      name: "RADIX ENGENHARIA E DESENVOLVIMENTO S/A",
      slug: "radix",
      count: 64,
    },
  ],
  technologies: [
    { value: "python", count: 383 },
    { value: "aws", count: 362 },
  ],
  workModels: [
    { value: "remote", count: 600 },
    { value: "hybrid", count: 738 },
  ],
  seniorities: [{ value: "SENIOR", count: 700 }],
  areas: [{ value: "DATA_AI", count: 400 }],
  cities: [
    {
      city: "São Paulo",
      state: "SP",
      stateName: "São Paulo",
      slug: "sao-paulo-sp",
      count: 34,
    },
  ],
};

function dataAiLanding() {
  const landing = areaLanding("DATA_AI");
  if (!landing) throw new Error("DATA_AI deveria ter landing");
  return landing;
}

describe("companyDisplayName", () => {
  it("tira o sufixo societário e normaliza razão social em caixa alta", () => {
    expect(companyDisplayName("BTG PACTUAL HOLDING DE SEGUROS LTDA.")).toBe(
      "BTG Pactual Holding de Seguros",
    );
    expect(companyDisplayName("RADIX ENGENHARIA E DESENVOLVIMENTO S/A")).toBe(
      "Radix Engenharia e Desenvolvimento",
    );
    expect(companyDisplayName("SND SOLUCOES TECNOLOGIA")).toBe(
      "SND Solucoes Tecnologia",
    );
    expect(companyDisplayName('"tivit')).toBe("tivit");
  });

  it("não mexe em nome com caixa já deliberada", () => {
    expect(companyDisplayName("CI&T")).toBe("CI&T");
    expect(companyDisplayName("Itaú Unibanco")).toBe("Itaú Unibanco");
    expect(companyDisplayName("AB InBev Brasil")).toBe("AB InBev Brasil");
  });

  it("mantém siglas de até 4 letras e aplica a grafia oficial de marcas", () => {
    expect(companyDisplayName("CPFL SERVICOS")).toBe("CPFL Servicos");
    expect(companyDisplayName("AACD")).toBe("AACD");
    expect(companyDisplayName("CCEE")).toBe("CCEE");
    expect(companyDisplayName("TOTVS S.A.")).toBe("TOTVS");
    expect(companyDisplayName("PAGBANK")).toBe("PagBank");
    expect(companyDisplayName("ITAU UNIBANCO S.A.")).toBe("Itaú Unibanco");
    expect(companyDisplayName("XP INVESTIMENTOS CCTVM S.A.")).toBe(
      "XP Investimentos CCTVM",
    );
    expect(
      companyDisplayName("IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A."),
    ).toBe("iFood.com Agencia de Restaurantes Online");
    // 5+ letras sem grafia no mapa viram nome normal.
    expect(companyDisplayName("ALGAR")).toBe("Algar");
    expect(companyDisplayName("STEFANINI")).toBe("Stefanini");
    // Palavras de 4 letras que são nome (mapa) x siglas (ficam em caixa alta).
    expect(companyDisplayName("CASA GRANADO")).toBe("Casa Granado");
    expect(companyDisplayName("RUMO S/A")).toBe("Rumo");
    expect(companyDisplayName("C.VALE")).toBe("C.Vale");
    expect(companyDisplayName("GIRO.TECH")).toBe("Giro.Tech");
    expect(companyDisplayName("FISIA (NIKE)")).toBe("Fisia (Nike)");
    expect(companyDisplayName("TSEA ENERGIA (TOSHIBA)")).toBe(
      "TSEA Energia (Toshiba)",
    );
    expect(companyDisplayName("FMU FIAM FAAM")).toBe("FMU FIAM FAAM");
    // LTDA no meio do nome e "em recuperação judicial" saem.
    expect(
      companyDisplayName(
        "MOBLY COMERCIO VAREJISTA LTDA - EM RECUPERACAO JUDICIAL",
      ),
    ).toBe("Mobly Comercio Varejista");
    expect(companyDisplayName("Oi S.A., em Recuperação Judicial")).toBe("Oi");
    // Travessão do dado vira vírgula (regra de copy: sem travessão em título).
    expect(companyDisplayName("Vivo – Áreas Técnicas")).toBe(
      "Vivo, Áreas Técnicas",
    );
  });
});

describe("tecnologias", () => {
  it("gera slugs de URL limpos", () => {
    expect(toTechnologySlug("python")).toBe("python");
    expect(toTechnologySlug("power bi")).toBe("power-bi");
    expect(toTechnologySlug("c#")).toBe("c-sharp");
    expect(toTechnologySlug("c++")).toBe("cpp");
    expect(toTechnologySlug("node.js")).toBe("node-js");
    expect(toTechnologySlug(".net")).toBe("dotnet");
    expect(toTechnologySlug("ci/cd")).toBe("ci-cd");
  });

  it("resolve o slug de volta para a tecnologia do índice, e aceita URL antiga", () => {
    expect(resolveTechnologySlug(INDEX, "power-bi")).toBe("power bi");
    expect(resolveTechnologySlug(INDEX, "c-sharp")).toBe("c#");
    expect(resolveTechnologySlug(INDEX, "Python")).toBe("python");
    expect(resolveTechnologySlug(INDEX, "power%20bi")).toBe("power bi");
    expect(resolveTechnologySlug(null, "rust")).toBe("rust");
  });

  it("rótulo de exibição respeita a grafia oficial", () => {
    expect(technologyLabel("power bi")).toBe("Power BI");
    expect(technologyLabel("javascript")).toBe("JavaScript");
    expect(technologyLabel("kubernetes")).toBe("Kubernetes");
  });
});

describe("listEligibleLandings", () => {
  const paths = listEligibleLandings(INDEX).map((item) => item.landing.path);

  it("inclui só recortes com volume mínimo", () => {
    expect(paths).toContain("/radar/area/data_ai");
    expect(paths).toContain("/radar/area/data_ai/remoto");
    expect(paths).toContain("/radar/remotas");
    expect(paths).toContain("/radar/junior");
    expect(paths).toContain("/radar/empresa/stefanini-ltda");
    expect(paths).toContain("/radar/tecnologia/python");
    expect(paths).toContain("/radar/tecnologia/c-sharp");
    expect(paths).toContain("/radar/cidade/sao-paulo-sp");

    expect(paths).not.toContain("/radar/area/design_ux");
    expect(paths).not.toContain("/radar/area/data_ai/junior");
    expect(paths).not.toContain("/radar/estagio");
    expect(paths).not.toContain("/radar/estagio/remoto");
    expect(paths).not.toContain("/radar/empresa/pequena");
  });

  it("nunca cria landing para a área OTHER", () => {
    expect(paths).not.toContain("/radar/area/other");
    expect(areaLanding("OTHER")).toBeNull();
  });
});

describe("textos da landing", () => {
  it("título com contagem e página", () => {
    expect(landingSeoTitle(remoteLanding(), SUMMARY, 1)).toBe(
      "Vagas remotas de tecnologia: 1.338 vagas abertas",
    );
    expect(landingSeoTitle(remoteLanding(), SUMMARY, 3)).toBe(
      "Vagas remotas de tecnologia: 1.338 vagas abertas (página 3)",
    );
    expect(landingSeoTitle(remoteLanding(), null, 1)).toBe(
      "Vagas remotas de tecnologia",
    );
  });

  it("descrição com números e empresas, no limite de 160 caracteres", () => {
    const description = landingSeoDescription(remoteLanding(), SUMMARY);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain("1.338");
    expect(description).toContain("CI&T");
  });

  it("abertura e FAQ vêm dos dados do recorte", () => {
    const intro = landingIntro(remoteLanding(), SUMMARY);
    expect(intro).toContain("1.338 vagas abertas agora");
    expect(intro).toContain("203 publicadas nos últimos 7 dias");
    expect(intro).toContain("Python");

    const faq = landingFaq(dataAiLanding(), SUMMARY);
    expect(faq[0]?.answer).toContain("1.338");
    expect(faq[0]?.answer).not.toMatch(/[—–]/);
    expect(faq[0]?.answer).toContain(
      "você vê quais combinam com seu currículo",
    );
    // recorte sem filtro de modalidade: pergunta sobre home office com %
    expect(faq.some((item) => item.answer.includes("45%"))).toBe(true);
    // landing remota não pergunta se há vaga remota
    expect(
      landingFaq(remoteLanding(), SUMMARY).some((item) =>
        item.question.startsWith("Existem"),
      ),
    ).toBe(false);
  });

  it("FAQ de contagem: plural com os 7 dias, singular e sem os 7 dias quando N = 0", () => {
    expect(landingFaq(remoteLanding(), SUMMARY)[0]?.answer).toBe(
      "1.338 vagas remotas (home office) de tecnologia abertas agora, 203 publicadas nos últimos 7 dias. A lista é atualizada várias vezes ao dia e você vê quais combinam com seu currículo.",
    );
    expect(
      landingFaq(remoteLanding(), { ...SUMMARY, total: 1, newLast7Days: 0 })[0]
        ?.answer,
    ).toBe(
      "1 vaga remota (home office) de tecnologia aberta agora. A lista é atualizada várias vezes ao dia e você vê quais combinam com seu currículo.",
    );
  });

  it("empresa não se lista como 'quem mais contrata' na própria página", () => {
    const landing = companyLanding("STEFANINI LTDA");
    expect(landing.heading).toBe("Vagas Stefanini");
    expect(landingIntro(landing, SUMMARY)).not.toContain("Quem mais contrata");
  });
});

describe("links internos", () => {
  it("relacionados nunca apontam para a própria página nem para recorte sem volume", () => {
    const landing = dataAiLanding();
    const hrefs = landingRelatedLinks(landing, SUMMARY, INDEX).flatMap(
      (group) => group.links.map((link) => link.href),
    );
    expect(hrefs).not.toContain(landing.path);
    expect(hrefs).toContain("/radar/area/data_ai/remoto");
    expect(hrefs).not.toContain("/radar/area/data_ai/junior");
    expect(hrefs).toContain("/radar/tecnologia/python");
  });

  it("vaga linka área, área remota, empresa, cidade e tecnologias com volume", () => {
    const links = jobLandingLinks(
      {
        company: "STEFANINI LTDA",
        dominantArea: "DATA_AI",
        workModel: "remote",
        city: "São Paulo",
        state: "SP",
        technologies: ["rust", "python", "power bi", "c#"],
      },
      INDEX,
    );
    expect(links.map((link) => link.href)).toEqual([
      "/radar/area/data_ai",
      "/radar/area/data_ai/remoto",
      "/radar/empresa/stefanini-ltda",
      "/radar/cidade/sao-paulo-sp",
      "/radar/remotas",
      technologyLanding("python").path,
      technologyLanding("power bi").path,
    ]);
  });

  it("sem índice, mantém os links de sempre", () => {
    const links = jobLandingLinks(
      {
        company: "Acme",
        dominantArea: "DATA_AI",
        workModel: "remote",
        city: null,
        state: null,
        technologies: [],
      },
      null,
    );
    expect(links.map((link) => link.href)).toEqual([
      "/radar/area/data_ai",
      "/radar/empresa/acme",
      "/radar/remotas",
    ]);
  });
});
