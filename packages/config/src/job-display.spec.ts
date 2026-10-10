import assert from "node:assert/strict";
import test from "node:test";

import {
  companyDisplayName,
  formatJobTitle,
  hasJobIdPrefix,
  stripJobIdPrefix,
} from "./job-display.js";

test("companyDisplayName mantém apóstrofo entre letras e tira aspas soltas", () => {
  assert.equal(companyDisplayName("LET'S RENT A CAR"), "Let's Rent A Car");
  assert.equal(companyDisplayName("LET’S RENT A CAR S.A."), "Let’s Rent A Car");
  assert.equal(companyDisplayName('"tivit'), "tivit");
  assert.equal(companyDisplayName("'Acme'"), "Acme");
});

test("companyDisplayName segue a regra de caixa e sufixo societário", () => {
  assert.equal(
    companyDisplayName("BTG PACTUAL HOLDING DE SEGUROS LTDA."),
    "BTG Pactual Holding de Seguros",
  );
  assert.equal(companyDisplayName("CI&T"), "CI&T");
  assert.equal(companyDisplayName("ITAU UNIBANCO S.A."), "Itaú Unibanco");
  assert.equal(
    companyDisplayName("Vivo – Áreas Técnicas"),
    "Vivo, Áreas Técnicas",
  );
});

test("stripJobIdPrefix remove o ID interno do Lever da CI&T", () => {
  assert.equal(
    stripJobIdPrefix("[Job-32186] Senior AI Developer"),
    "Senior AI Developer",
  );
  assert.equal(stripJobIdPrefix("[job-1]   Dev   Java"), "Dev Java");
  assert.equal(stripJobIdPrefix("[Job - 30501] AI Engineer"), "AI Engineer");
  assert.equal(hasJobIdPrefix("[Job - 30501] AI Engineer"), true);
  assert.equal(stripJobIdPrefix("[ Job - 30678] C# Developer"), "C# Developer");
  assert.equal(
    stripJobIdPrefix("[Job 29685] AI Orchestrator"),
    "AI Orchestrator",
  );
  assert.equal(
    stripJobIdPrefix("[Job 31273 Data Analytics Senior"),
    "Data Analytics Senior",
  );
  assert.equal(hasJobIdPrefix("Dev  Java"), false);
  assert.equal(hasJobIdPrefix("[Jobs] Dev"), false);
  assert.equal(stripJobIdPrefix("Dev [Job-1] Java"), "Dev [Job-1] Java");
});

test("formatJobTitle normaliza cargo em caixa alta com termos técnicos", () => {
  assert.equal(formatJobTitle("ANALISTA DE BI SR"), "Analista de BI Sr");
  assert.equal(
    formatJobTitle("ENGENHEIRO DEVOPS/SRE PLENO"),
    "Engenheiro DevOps/SRE Pleno",
  );
  assert.equal(formatJobTitle("DESENVOLVEDOR IOS"), "Desenvolvedor iOS");
  assert.equal(formatJobTitle("ANALISTA DE QA II"), "Analista de QA II");
  assert.equal(formatJobTitle("DESIGNER UX/UI"), "Designer UX/UI");
  assert.equal(formatJobTitle("CONSULTOR SAP FI"), "Consultor SAP Fi");
  assert.equal(formatJobTitle("ANALISTA DE TI E RH"), "Analista de TI e RH");
  assert.equal(
    formatJobTitle("ENGENHEIRO DE ML / IA"),
    "Engenheiro de ML / IA",
  );
  assert.equal(
    formatJobTitle("ESPECIALISTA EM AUTOMAÇÃO"),
    "Especialista em Automação",
  );
  assert.equal(formatJobTitle("E-COMMERCE ANALYST"), "E-Commerce Analyst");
});

test("formatJobTitle não mexe em caixa mista e tira o prefixo de ID", () => {
  assert.equal(formatJobTitle("Analista de BI"), "Analista de BI");
  assert.equal(formatJobTitle("Dev iOS SR"), "Dev iOS SR");
  assert.equal(
    formatJobTitle("[Job-9] DESENVOLVEDOR JAVA"),
    "Desenvolvedor Java",
  );
  assert.equal(formatJobTitle("123"), "123");
});
