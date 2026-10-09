import { describe, expect, it } from "vitest";

import {
  buildJobSeoDescription,
  buildJobSeoTitle,
  cleanJobTitleForDisplay,
  isTalentPool,
  resolveAddressCountry,
  toSchemaEmploymentType,
} from "./job-seo";

const base = {
  city: "São Paulo",
  company: "CI&T",
  country: "BR",
  state: "SP",
  title: "Dev",
  workModel: "on-site",
};

describe("cleanJobTitleForDisplay", () => {
  it("tira o prefixo [Job-123] do ATS e espaços duplicados", () => {
    expect(
      cleanJobTitleForDisplay("[Job-32186] Senior AI Developer, Brazil"),
    ).toBe("Senior AI Developer, Brazil");
    expect(cleanJobTitleForDisplay("Analista   de  Dados ")).toBe(
      "Analista de Dados",
    );
    expect(cleanJobTitleForDisplay("Dev [Job-1]")).toBe("Dev [Job-1]");
  });
});

describe("buildJobSeoTitle", () => {
  it("cargo na empresa (local) | EarlyCV, com Remoto para vaga remota", () => {
    expect(buildJobSeoTitle(base)).toBe("Dev na CI&T (São Paulo) | EarlyCV");
    expect(buildJobSeoTitle({ ...base, workModel: "remote" })).toBe(
      "Dev na CI&T (Remoto) | EarlyCV",
    );
    expect(buildJobSeoTitle({ ...base, city: null })).toBe(
      "Dev na CI&T | EarlyCV",
    );
  });

  it("acima de 60: tira o local, depois corta a empresa por palavra", () => {
    const longCity = buildJobSeoTitle({
      ...base,
      title: "Analista de Dados Sênior",
      company: "Accenture do Brasil",
      city: "Rio de Janeiro",
    });
    expect(longCity).toBe(
      "Analista de Dados Sênior na Accenture do Brasil | EarlyCV",
    );
    expect(longCity.length).toBeLessThanOrEqual(60);

    const longCompany = buildJobSeoTitle({
      ...base,
      title: "Analista de Dados Sênior",
      company: "AMCOM SISTEMAS DE INFORMACAO S/A",
    });
    expect(longCompany).toBe(
      "Analista de Dados Sênior na Amcom Sistemas de… | EarlyCV",
    );
    expect(longCompany.length).toBeLessThanOrEqual(60);
  });

  it("nunca corta o cargo: sem espaço nem para uma palavra da empresa, sai sem empresa", () => {
    const title =
      "Engenheiro de Software Sênior Backend Plataforma de Pagamentos";
    expect(buildJobSeoTitle({ ...base, title })).toBe(`${title} | EarlyCV`);
  });
});

describe("buildJobSeoDescription", () => {
  it("monta o texto com local e corta em 155 sem quebrar palavra", () => {
    expect(buildJobSeoDescription(base)).toBe(
      "Vaga de Dev na CI&T, São Paulo. Veja grátis sua compatibilidade com a vaga e adapte seu currículo em minutos no EarlyCV.",
    );
    const long = buildJobSeoDescription({
      ...base,
      title: "Engenheiro de Software Sênior Backend Plataforma de Pagamentos",
      company: "AMICCI SHEFA ZAHAV PLATAFORMA DE DESENVOLVIMENTO LTDA",
    });
    expect(long.length).toBeLessThanOrEqual(155);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });
});

describe("toSchemaEmploymentType", () => {
  it.each([
    ["full_time", "FULL_TIME"],
    ["Full time", "FULL_TIME"],
    ["Full-time", "FULL_TIME"],
    ["CLT", "FULL_TIME"],
    ["Efetivo", "FULL_TIME"],
    ["vacancy_type_trainee", "FULL_TIME"],
    ["partial-time", "PART_TIME"],
    ["Part time", "PART_TIME"],
    ["meio período", "PART_TIME"],
    ["estágio", "INTERN"],
    ["internship", "INTERN"],
    ["apprentice", "INTERN"],
    ["pj", "CONTRACTOR"],
    ["autonomous", "CONTRACTOR"],
    ["cooperado", "CONTRACTOR"],
    ["vacancy_type_outsource", "CONTRACTOR"],
    ["temporary", "TEMPORARY"],
    ["temporário", "TEMPORARY"],
  ])("%s -> %s", (raw, expected) => {
    expect(toSchemaEmploymentType(raw)).toBe(expected);
  });

  it.each([
    "talent_pool",
    "Homeoffice",
    "vacancy_type_associate",
    "vacancy_type_parter",
    "qualquer",
  ])("omite valor fora do mapa: %s", (raw) => {
    expect(toSchemaEmploymentType(raw)).toBeUndefined();
  });

  it("reconhece banco de talentos", () => {
    expect(isTalentPool("talent_pool")).toBe(true);
    expect(isTalentPool("full_time")).toBe(false);
    expect(isTalentPool(null)).toBe(false);
  });
});

describe("resolveAddressCountry", () => {
  it.each([
    [{ country: "Brasil", state: null, city: null }, "BR"],
    [{ country: "BRA", state: null, city: null }, "BR"],
    [{ country: "Brazil - Rio de Janeiro", state: null, city: null }, "BR"],
    [{ country: "SP", state: null, city: "São Paulo" }, "BR"],
    [{ country: null, state: "MG", city: "Belo Horizonte" }, "BR"],
    [
      { country: "Rio de Janeiro ou Teletrabalho", state: null, city: null },
      "BR",
    ],
    [{ country: "Remote", state: null, city: "Brazil" }, "BR"],
    [{ country: "Remote; Texas", state: "USA", city: "Illinois" }, "foreign"],
    [{ country: "Remote", state: null, city: "Portugal" }, "foreign"],
    [{ country: "Colombia; São Paulo", state: null, city: null }, "ambiguous"],
    [{ country: "Remote", state: null, city: "Remote" }, "ambiguous"],
    [{ country: null, state: null, city: null }, "ambiguous"],
  ] as const)("%o -> %s", (job, expected) => {
    expect(resolveAddressCountry(job)).toBe(expected);
  });
});
