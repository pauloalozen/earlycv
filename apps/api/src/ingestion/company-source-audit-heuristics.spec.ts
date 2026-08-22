import assert from "node:assert/strict";
import { test } from "node:test";

import {
  identityTokens,
  isKnownAtsPlatformHost,
  registrableDomain,
  scoreUrlAgainstCompany,
} from "./company-source-audit-heuristics";

test("registrableDomain handles compound .com.br suffixes", () => {
  assert.equal(registrableDomain("fiesc.pandape.com.br"), "pandape.com.br");
  assert.equal(registrableDomain("jobs.gerdau.com"), "gerdau.com");
  assert.equal(registrableDomain("careers.jnj.com"), "jnj.com");
});

test("identityTokens extracts the client slug for known ATS path providers", () => {
  assert.deepEqual(identityTokens("https://boards.greenhouse.io/vercel"), [
    "vercel",
  ]);
  assert.deepEqual(identityTokens("https://jobs.ashbyhq.com/Linear"), [
    "linear",
  ]);
  assert.deepEqual(identityTokens("https://api.lever.co/v0/postings/ciandt"), [
    "ciandt",
  ]);
});

test("identityTokens extracts the client subdomain for known ATS subdomain providers", () => {
  assert.deepEqual(identityTokens("https://vento.teamtailor.com/"), ["vento"]);
  assert.deepEqual(identityTokens("https://cabrasil.pandape.com.br/"), [
    "cabrasil",
  ]);
});

test("identityTokens falls back to the registrable domain core for own-domain career pages", () => {
  assert.deepEqual(identityTokens("https://jobs.gerdau.com/search"), [
    "gerdau",
  ]);
});

test("identityTokens ignores generic slugs that carry no company identity", () => {
  assert.deepEqual(identityTokens("https://career.teamtailor.com/"), []);
  assert.deepEqual(identityTokens("https://jobs.enel.com/careers"), ["enel"]);
});

test("isKnownAtsPlatformHost recognizes Brazilian and global ATS hosts", () => {
  assert.equal(isKnownAtsPlatformHost("vemparaaveracel.gupy.io"), true);
  assert.equal(isKnownAtsPlatformHost("boards.greenhouse.io"), true);
  assert.equal(isKnownAtsPlatformHost("www.bb.com.br"), false);
});

test("scoreUrlAgainstCompany: VERACEL x Vercel board — the case that triggered this audit", () => {
  const result = scoreUrlAgainstCompany(
    "https://boards.greenhouse.io/vercel",
    "VERACEL",
  );
  // Precisa ficar ABAIXO de MATCH_THRESHOLD (0.6): e o que faz
  // audit-company-sources.ts nao descartar essa URL como "parece
  // correta" so pela auto-similaridade — apesar de "veracel" e "vercel"
  // terem bigramas bem parecidos, sao empresas diferentes.
  assert.ok(
    result.score < 0.6,
    `expected score below MATCH_THRESHOLD, got ${result.score}`,
  );
});

test("scoreUrlAgainstCompany: correct gupy source scores high against its own company", () => {
  const result = scoreUrlAgainstCompany(
    "https://vemparaaveracel.gupy.io/",
    "VERACEL",
  );
  assert.ok(
    result.score >= 0.6,
    `expected high self-match, got ${result.score}`,
  );
});

test("scoreUrlAgainstCompany: own-domain career page matches company name with suffix", () => {
  const result = scoreUrlAgainstCompany(
    "https://jobs.gerdau.com/search",
    "Gerdau (Workday)",
  );
  assert.ok(result.score >= 0.6, `expected high match, got ${result.score}`);
});

test("scoreUrlAgainstCompany: unrelated company/URL pair scores low", () => {
  const result = scoreUrlAgainstCompany(
    "https://boards.greenhouse.io/anthropic",
    "UFRA",
  );
  assert.ok(result.score < 0.3, `expected very low match, got ${result.score}`);
});
