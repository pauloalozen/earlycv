import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bebeeOriginOf,
  boardKey,
  isAggregatorHost,
  isGenericCompanyName,
  parseBebeeJobPage,
} from "./bebee-discovery";

test("bebeeOriginOf lê o feed de origem do sufixo da URL", () => {
  assert.equal(
    bebeeOriginOf(
      "https://bebee.com/br/jobs/analista-senior-mercado-livre-minas-gerais--t7xk-870851774",
    ),
    "t7xk",
  );
  assert.equal(
    bebeeOriginOf("https://bebee.com/br/jobs/estoquista-acme-sao-paulo--fj-123"),
    "fj",
  );
  assert.equal(
    bebeeOriginOf("https://bebee.com/br/jobs/zelador-tlsv-itajai--techmap_br_38749809"),
    "techmap",
  );
  assert.equal(bebeeOriginOf("https://bebee.com/br/jobs/industry/atacado"), null);
});

test("parseBebeeJobPage extrai apply_url e publisher_name do payload RSC escapado", () => {
  const html =
    '<script>self.__next_f.push([1,"{\\"job\\":{\\"end_date\\":\\"2026-12-13\\",' +
    '\\"source_url\\":\\"https://indeed.com/viewjob?jk=1\\",' +
    '\\"apply_url\\":\\"https://mercadolibre.eightfold.ai/careers/job/44762949?domain=mercadolibre.com\\\\u0026x=1\\",' +
    '\\"publisher_name\\":\\"Mercado Livre\\"}}"])</script>';

  assert.deepEqual(parseBebeeJobPage(html), {
    applyUrl:
      "https://mercadolibre.eightfold.ai/careers/job/44762949?domain=mercadolibre.com&x=1",
    publisherName: "Mercado Livre",
  });
});

test("parseBebeeJobPage devolve null quando a página não traz os campos", () => {
  assert.deepEqual(parseBebeeJobPage("<html></html>"), {
    applyUrl: null,
    publisherName: null,
  });
});

test("isAggregatorHost reconhece LinkedIn, Indeed e o próprio beBee", () => {
  assert.equal(isAggregatorHost("br.linkedin.com"), true);
  assert.equal(isAggregatorHost("br.indeed.com"), true);
  assert.equal(isAggregatorHost("bebee.com"), true);
  assert.equal(isAggregatorHost("lojasrenner.gupy.io"), false);
});

test("boardKey ignora diferença cosmética entre URLs do mesmo board", () => {
  assert.equal(boardKey("https://lojasrenner.gupy.io/"), "lojasrenner.gupy.io");
  assert.equal(boardKey("lojasrenner.gupy.io/jobs"), "lojasrenner.gupy.io");
  assert.equal(
    boardKey("https://tendaatacado.pandape.infojobs.com.br/Detail/1"),
    "tendaatacado.pandape.com.br",
  );
  assert.equal(
    boardKey("https://job-boards.greenhouse.io/Nubank/jobs/1"),
    "boards.greenhouse.io/nubank",
  );
  assert.equal(boardKey("https://jobs.lever.co/"), null);
  assert.equal(
    boardKey("https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers"),
    "santander.wd3.myworkdayjobs.com/santandercareers",
  );
  assert.equal(
    boardKey("https://santander.wd3.myworkdayjobs.com/SantanderCareers/job/x_R1"),
    "santander.wd3.myworkdayjobs.com/santandercareers",
  );
});

test("isGenericCompanyName pega título de página de carreira no lugar do nome", () => {
  assert.equal(isGenericCompanyName("pagina-de-carreira"), true);
  assert.equal(isGenericCompanyName("trabalhe-conosco-fibra"), true);
  assert.equal(isGenericCompanyName("mercado-livre"), false);
});
