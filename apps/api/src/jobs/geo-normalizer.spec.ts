import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isForeignLocation,
  normalizeCity,
  normalizeState,
} from "./geo-normalizer";

test("normalizeState resolves sigla, nome por extenso e variações de caixa/acento pra mesma UF", () => {
  assert.deepEqual(normalizeState("SP"), { sigla: "SP", nome: "São Paulo" });
  assert.deepEqual(normalizeState("São Paulo"), {
    sigla: "SP",
    nome: "São Paulo",
  });
  assert.deepEqual(normalizeState("SAO PAULO"), {
    sigla: "SP",
    nome: "São Paulo",
  });
  assert.deepEqual(normalizeState("sao paulo"), {
    sigla: "SP",
    nome: "São Paulo",
  });
  assert.deepEqual(normalizeState("RJ"), {
    sigla: "RJ",
    nome: "Rio de Janeiro",
  });
  assert.deepEqual(normalizeState("rio de janeiro"), {
    sigla: "RJ",
    nome: "Rio de Janeiro",
  });
});

test("normalizeState retorna null pra sigla/nome que não bate com nenhuma das 27 UFs", () => {
  assert.equal(normalizeState("CA"), null);
  assert.equal(normalizeState("California"), null);
  assert.equal(normalizeState("BR"), null);
  assert.equal(normalizeState(""), null);
  assert.equal(normalizeState("   "), null);
  assert.equal(normalizeState(undefined), null);
  assert.equal(normalizeState(null), null);
});

test("normalizeState não confunde composto tipo 'Sao Paulo - SP' com uma UF válida", () => {
  assert.equal(normalizeState("Sao Paulo - SP"), null);
});

test("normalizeCity aplica title case e reaproveita a tabela de UFs pra restaurar acento em nomes que colidem com estado", () => {
  assert.equal(normalizeCity("sao paulo"), "São Paulo");
  assert.equal(normalizeCity("SAO PAULO"), "São Paulo");
  assert.equal(normalizeCity("São Paulo"), "São Paulo");
  assert.equal(normalizeCity("rio de janeiro"), "Rio de Janeiro");
  assert.equal(normalizeCity("belo horizonte"), "Belo Horizonte");
  assert.equal(normalizeCity("  campinas  "), "Campinas");
});

test("normalizeCity retorna null pra entrada vazia/nula", () => {
  assert.equal(normalizeCity(null), null);
  assert.equal(normalizeCity(undefined), null);
  assert.equal(normalizeCity(""), null);
  assert.equal(normalizeCity("   "), null);
});

test("isForeignLocation rejeita quando country real (nao BR) vem preenchido", () => {
  assert.equal(isForeignLocation("United States", null), true);
  assert.equal(
    isForeignLocation("United States of America", "California"),
    true,
  );
  assert.equal(isForeignLocation("India", "Karnātaka"), true);
  assert.equal(isForeignLocation("Brasil", "SP"), false);
  assert.equal(isForeignLocation("Brazil", null), false);
  assert.equal(isForeignLocation("BR", null), false);
});

test("isForeignLocation cai pro state quando country vem vazio (fallback dos adapters via parseLocation)", () => {
  // Waymo/Anthropic/Datadog/Scale AI (Greenhouse): country nunca vem
  // estruturado, so o state ("CA", "New York") denuncia que e vaga de fora.
  assert.equal(isForeignLocation(undefined, "CA"), true);
  assert.equal(isForeignLocation(undefined, "New York"), true);
  assert.equal(isForeignLocation(undefined, "CA; New York"), true);
  assert.equal(isForeignLocation(undefined, "NY | Seattle"), true);
  assert.equal(isForeignLocation(null, "Ireland"), true);
});

test("isForeignLocation nao rejeita vaga BR real com state ausente ou sujo demais pra reconhecer", () => {
  // Nenhum sinal (nem country nem state) -> nunca bloqueia por falta de dado.
  assert.equal(isForeignLocation(undefined, undefined), false);
  assert.equal(isForeignLocation(null, null), false);
  // Casos reais de vaga BR publicavel com state mal formatado (Natura,
  // Loft) -- normalizeState falha pra essas, mas nao sao estado
  // americano/pais estrangeiro reconhecido, entao nao podem ser excluidas.
  assert.equal(isForeignLocation(undefined, "Brazil)"), false);
  assert.equal(isForeignLocation(undefined, "Remoto"), false);
  assert.equal(isForeignLocation(undefined, "Sao Paulo - SP"), false);
});

test("isForeignLocation reconhece BRA (ISO alpha-3, usado pela Gupy) como Brasil", () => {
  assert.equal(isForeignLocation("BRA", "SP"), false);
  assert.equal(isForeignLocation("bra", null), false);
});

test("isForeignLocation nao rejeita quando UF/cidade BR vaza pro campo country (bug real do parseLocation do Greenhouse/Lever/Inhire)", () => {
  // BTG Pactual, Banco PAN, Braze Brasil, Arco Educacao, Vtex: location de
  // um token so ("Sao Paulo") cai inteiro no campo country.
  assert.equal(isForeignLocation("São Paulo", null), false);
  assert.equal(isForeignLocation("Sao Paulo", null), false);
  // Cidade isolada que não é também nome de UF (ex: "Curitiba" sozinho,
  // sem estado junto) continua fora do escopo — normalizeCity/normalizeState
  // não mantêm gazetteer de municípios de propósito (fora do escopo desta
  // normalização). "Curitiba" só é reconhecido quando aparece ao lado de
  // uma UF/cidade-capital, como no caso composto abaixo.
  assert.equal(isForeignLocation("Remoto", null), false);
  assert.equal(isForeignLocation("Remote", null), false);
  // Location composto (mesmo bug, varias formas observadas na base real).
  assert.equal(isForeignLocation("São Paulo ou Rio de Janeiro", null), false);
  assert.equal(isForeignLocation("São Paulo e Rio de Janeiro", null), false);
  assert.equal(
    isForeignLocation("São Paulo-SP / Rio de Janeiro-RJ", null),
    false,
  );
  assert.equal(
    isForeignLocation("São Paulo; Curitiba; Fortaleza", null),
    false,
  );
});

test("isForeignLocation ainda rejeita pais estrangeiro real mesmo depois do fix de UF-no-country", () => {
  assert.equal(isForeignLocation("United States", null), true);
  assert.equal(isForeignLocation("New York", null), true);
  assert.equal(isForeignLocation("India", null), true);
});

// Bug real de produção (LOUIS DREYFUS BR, board Lever global): posting.country
// da Lever manda código ISO-3166-1 alpha-2 do país estrangeiro, e vários
// desses códigos colidem com a sigla de alguma UF brasileira — RO=Romênia
// vs UF Rondônia, PA=Panamá vs UF Pará, PE=Peru vs UF Pernambuco, SE=Suécia
// vs UF Sergipe, TO=Tonga vs UF Tocantins, AL=Albânia vs UF Alagoas,
// MT=Malta vs UF Mato Grosso, BA=Bósnia vs UF Bahia. O fallback de
// isBrazilianCountryValue não pode mais resolver token de 2 letras isolado
// via sigla de UF (só via nome por extenso), senão vaga de Bucareste
// (country="RO") passava como brasileira.
test("isForeignLocation rejeita código ISO de país que colide com sigla de UF brasileira", () => {
  assert.equal(
    isForeignLocation("RO", "Romania"),
    true,
    "RO = Romênia, não Rondônia",
  );
  assert.equal(
    isForeignLocation("PA", "Panama"),
    true,
    "PA = Panamá, não Pará",
  );
  assert.equal(
    isForeignLocation("PE", "Peru"),
    true,
    "PE = Peru, não Pernambuco",
  );
  assert.equal(
    isForeignLocation("SE", "Sweden"),
    true,
    "SE = Suécia, não Sergipe",
  );
  assert.equal(
    isForeignLocation("TO", "Tonga"),
    true,
    "TO = Tonga, não Tocantins",
  );
  assert.equal(
    isForeignLocation("AL", "Albania"),
    true,
    "AL = Albânia, não Alagoas",
  );
  assert.equal(
    isForeignLocation("MT", "Malta"),
    true,
    "MT = Malta, não Mato Grosso",
  );
  assert.equal(
    isForeignLocation("BA", "Bosnia"),
    true,
    "BA = Bósnia, não Bahia",
  );
  // Nome por extenso de UF continua reconhecido normalmente (não regrediu).
  assert.equal(isForeignLocation("Rondônia", null), false);
  assert.equal(isForeignLocation("Pará", null), false);
});
