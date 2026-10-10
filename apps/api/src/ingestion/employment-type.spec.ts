import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isTalentPoolTitle,
  normalizeEmploymentType,
  resolveEmploymentType,
} from "./employment-type";

test("normalizeEmploymentType unifica o vocabulário das fontes", () => {
  const cases: Array<[string, string | null]> = [
    ["CLT", "clt"],
    ["Efetivo", "clt"],
    ["vacancy_type_effective", "clt"],
    ["full_time", "full_time"],
    ["Full time", "full_time"],
    ["Full-Time", "full_time"],
    ["Full time - permanent", "full_time"],
    ["Permanent", "full_time"],
    ["partial-time", "part_time"],
    ["Part Time", "part_time"],
    ["estágio", "internship"],
    ["vacancy_type_internship", "internship"],
    ["vacancy_type_apprentice", "apprentice"],
    ["vacancy_type_trainee", "trainee"],
    ["contrato temporário", "temporary"],
    ["Full time - fixed term", "temporary"],
    ["pj", "pj"],
    ["vacancy_type_freelancer", "autonomous"],
    ["vacancy_type_talent_pool", "talent_pool"],
    ["Homeoffice", null],
    ["vacancy_type_associate", null],
    ["", null],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(normalizeEmploymentType(raw), expected, raw);
  }
});

test("isTalentPoolTitle reconhece banco de talentos no título", () => {
  assert.equal(isTalentPoolTitle("Banco de Talentos - Tech Lead"), true);
  assert.equal(isTalentPoolTitle("[Banco de Talentos] Product Owner"), true);
  assert.equal(isTalentPoolTitle("Field Service Engineer (Talent Pool)"), true);
  assert.equal(
    isTalentPoolTitle("AUXILIAR DE SUPORTE TÉCNICO - TI (banco de talentos)"),
    true,
  );
  assert.equal(isTalentPoolTitle("Desenvolvedor Java Sênior | Remoto"), false);
  assert.equal(isTalentPoolTitle("Analista de Talent Acquisition"), false);
});

test("resolveEmploymentType guarda o cru e prioriza talent pool pelo título", () => {
  assert.deepEqual(
    resolveEmploymentType({
      employmentType: "clt",
      employmentTypeRaw: "CLT",
      title: "Banco de Talentos - Tecnologia",
    }),
    { employmentType: "talent_pool", employmentTypeRaw: "CLT" },
  );
  assert.deepEqual(
    resolveEmploymentType({
      employmentType: "Homeoffice",
      employmentTypeRaw: null,
      title: "Dev Java",
    }),
    { employmentType: null, employmentTypeRaw: "Homeoffice" },
  );
  assert.deepEqual(resolveEmploymentType({ title: "Dev Java" }), {
    employmentType: null,
    employmentTypeRaw: null,
  });
});
