import assert from "node:assert/strict";
import { test } from "node:test";

import { parseJobLocations } from "./location-parser";

function parsed(input: Parameters<typeof parseJobLocations>[0]): string[] {
  return parseJobLocations(input).map((item) => `${item.city}/${item.state}`);
}

test("usa a grafia do IBGE e a UF da cidade do campo city", () => {
  assert.deepEqual(parsed({ city: "Taboão Da Serra", state: "SP" }), [
    "Taboão da Serra/SP",
  ]);
  assert.deepEqual(parsed({ city: "SAO PAULO", state: "SP" }), [
    "São Paulo/SP",
  ]);
  assert.deepEqual(parsed({ locationText: "Jundiai", country: "Brazil" }), [
    "Jundiaí/SP",
  ]);
});

test("lista até 3 cidades quando o texto tem conector", () => {
  assert.deepEqual(parsed({ locationText: "São Paulo ou Rio de Janeiro" }), [
    "São Paulo/SP",
    "Rio de Janeiro/RJ",
  ]);
  assert.deepEqual(
    parsed({ locationText: "São Paulo-SP / Rio de Janeiro-RJ" }),
    ["São Paulo/SP", "Rio de Janeiro/RJ"],
  );
  assert.deepEqual(
    parsed({
      city: "Belo Horizonte",
      locationText: "Belo Horizonte, MG, BR - SP, Recife ou Curitiba?",
      state: "MG",
    }),
    ["Belo Horizonte/MG", "Recife/PE", "Curitiba/PR"],
  );
  assert.deepEqual(
    parsed({ locationText: "Fortaleza, Curitiba e São Paulo e Recife" }),
    ["Fortaleza/CE", "Curitiba/PR", "São Paulo/SP"],
  );
});

test("texto hierárquico fica com uma cidade só", () => {
  assert.deepEqual(
    parsed({
      city: "Campinas",
      country: "Brazil",
      locationText: "Campinas, São Paulo, Brazil",
      state: "SP",
    }),
    ["Campinas/SP"],
  );
  assert.deepEqual(parsed({ locationText: "BR, São Paulo, Sumare" }), [
    "Sumaré/SP",
  ]);
  assert.deepEqual(parsed({ locationText: "Brazil - Sao Paulo - Pinheiros" }), [
    "São Paulo/SP",
  ]);
  assert.deepEqual(
    parsed({
      city: "Recife",
      locationText: "Recife, Armazem 9",
      state: "Armazem 9",
    }),
    ["Recife/PE"],
  );
  assert.deepEqual(
    parsed({
      city: "São Paulo",
      locationText: "São Paulo, SP, BR - Vila Olímpia (1x na semana)",
      state: "SP",
    }),
    ["São Paulo/SP"],
  );
});

test("reconhece códigos IATA só em maiúsculas", () => {
  assert.deepEqual(parsed({ locationText: "BR-CWB-009" }), ["Curitiba/PR"]);
  assert.deepEqual(parsed({ locationText: "POA05 - RS POA 95 (POA05)" }), [
    "Porto Alegre/RS",
  ]);
  assert.deepEqual(parsed({ locationText: "Remote for Brazil" }), []);
});

test("não confunde bairro, estado e homônimo estrangeiro com cidade", () => {
  assert.deepEqual(parsed({ city: "Pinheiros", state: "SP" }), []);
  assert.deepEqual(parsed({ city: "Santa Catarina", state: "SC" }), []);
  assert.deepEqual(parsed({ locationText: "Regiao Sul, Brasil" }), []);
  assert.deepEqual(
    parsed({ locationText: "California, USA, Remote; Virginia, USA, Remote" }),
    [],
  );
  assert.deepEqual(
    parsed({
      locationText:
        "BR - Possui disponibilidade para atuar no modelo Hibrido em São Paulo, Campinas ou Belo Horizonte?",
    }),
    ["São Paulo/SP", "Campinas/SP", "Belo Horizonte/MG"],
  );
});

test("região administrativa do DF vira Brasília; sem cidade, lista vazia", () => {
  assert.deepEqual(parsed({ city: "Taguatinga", state: "DF" }), [
    "Brasília/DF",
  ]);
  assert.deepEqual(parsed({ locationText: "Brasil", country: "BR" }), []);
  assert.deepEqual(parsed({ locationText: "Remote" }), []);
  assert.deepEqual(parsed({}), []);
});
