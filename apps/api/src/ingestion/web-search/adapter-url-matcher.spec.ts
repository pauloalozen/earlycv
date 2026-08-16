import assert from "node:assert/strict";
import { test } from "node:test";
import { matchAdapterUrl } from "./adapter-url-matcher";

test("matchAdapterUrl reconhece Gupy pelo subdominio", () => {
  const result = matchAdapterUrl("https://venhasersafra.gupy.io/");
  assert.deepEqual(result, {
    careersUrl: "https://venhasersafra.gupy.io",
    sourceType: "gupy",
  });
});

test("matchAdapterUrl reconhece Greenhouse (boards.greenhouse.io e job-boards.greenhouse.io)", () => {
  assert.deepEqual(matchAdapterUrl("https://boards.greenhouse.io/empresax/jobs/123"), {
    careersUrl: "https://boards.greenhouse.io/empresax",
    sourceType: "greenhouse",
  });
  assert.deepEqual(matchAdapterUrl("https://job-boards.greenhouse.io/empresax"), {
    careersUrl: "https://boards.greenhouse.io/empresax",
    sourceType: "greenhouse",
  });
});

test("matchAdapterUrl reconhece Lever, Ashby, InHire, Teamtailor", () => {
  assert.deepEqual(matchAdapterUrl("https://jobs.lever.co/empresax/abc-123"), {
    careersUrl: "https://jobs.lever.co/empresax",
    sourceType: "lever",
  });
  assert.deepEqual(matchAdapterUrl("https://jobs.ashbyhq.com/empresax"), {
    careersUrl: "https://jobs.ashbyhq.com/empresax",
    sourceType: "ashby",
  });
  assert.deepEqual(matchAdapterUrl("https://empresax.inhire.app/"), {
    careersUrl: "https://empresax.inhire.app",
    sourceType: "inhire",
  });
  assert.deepEqual(matchAdapterUrl("https://empresax.teamtailor.com/jobs"), {
    careersUrl: "https://empresax.teamtailor.com",
    sourceType: "teamtailor",
  });
});

test("matchAdapterUrl reconhece Workday (tenant + instance + site)", () => {
  const result = matchAdapterUrl(
    "https://empresax.wd3.myworkdayjobs.com/pt-BR/Careers/job/Some-Role_R123",
  );
  assert.equal(result?.sourceType, "workday");
  assert.equal(
    result?.careersUrl,
    "https://empresax.wd3.myworkdayjobs.com/pt-BR/Careers/job/Some-Role_R123",
  );
});

test("matchAdapterUrl retorna null pra URLs sem dominio conhecido (LinkedIn, site institucional)", () => {
  assert.equal(matchAdapterUrl("https://linkedin.com/company/empresax"), null);
  assert.equal(matchAdapterUrl("https://empresax.com.br"), null);
  assert.equal(matchAdapterUrl("not a url"), null);
});
