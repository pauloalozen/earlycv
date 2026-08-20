import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractContactSignalsFromText,
  normalizeEmail,
  normalizeLinkedinHandle,
  normalizePhone,
} from "./talent-identity.util";

test("normalizeEmail lowercases and trims a valid email", () => {
  assert.equal(normalizeEmail("  Fulano@Example.com "), "fulano@example.com");
});

test("normalizeEmail rejects text without a valid email shape", () => {
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail(undefined), null);
  assert.equal(normalizeEmail(null), null);
});

test("normalizePhone strips formatting and the 55 country code", () => {
  assert.equal(normalizePhone("+55 (11) 98765-4321"), "11987654321");
  assert.equal(normalizePhone("(11) 3456-7890"), "1134567890");
});

test("normalizePhone rejects numbers too short to be DDD+numero", () => {
  assert.equal(normalizePhone("1234"), null);
  assert.equal(normalizePhone(undefined), null);
});

test("normalizeLinkedinHandle extracts only the /in/ slug, case-insensitive", () => {
  assert.equal(
    normalizeLinkedinHandle("https://www.linkedin.com/in/Fulano-Silva/"),
    "fulano-silva",
  );
  assert.equal(
    normalizeLinkedinHandle("linkedin.com/in/fulano-silva?x=1"),
    "fulano-silva",
  );
});

test("normalizeLinkedinHandle returns null for a non-linkedin url", () => {
  assert.equal(normalizeLinkedinHandle("https://example.com/in/fulano"), null);
});

test("extractContactSignalsFromText finds name/email/phone/linkedin in the CV header", () => {
  const text = `Fulano da Silva
Engenheiro de Software
fulano.silva@example.com | (11) 98765-4321
https://www.linkedin.com/in/fulano-silva

Experiencia com SQL, Python e AWS em produtos de dados.`;

  const result = extractContactSignalsFromText(text);

  assert.equal(result.fullName, "Fulano da Silva");
  assert.equal(result.email, "fulano.silva@example.com");
  assert.equal(result.phone, "(11) 98765-4321");
  assert.equal(result.linkedinUrl, "https://www.linkedin.com/in/fulano-silva");
  assert.deepEqual(result.skills.sort(), ["aws", "python", "sql"]);
});

test("extractContactSignalsFromText does not treat the first line as a name when it looks like a title/company", () => {
  const text = `CURRICULO PROFISSIONAL 2026
Fulano da Silva`;

  const result = extractContactSignalsFromText(text);

  assert.equal(result.fullName, undefined);
});

test("extractContactSignalsFromText ignores an email that only appears deep in the body (outside the header window)", () => {
  const filler = Array.from({ length: 40 }, (_, i) => `Linha ${i}`).join("\n");
  const text = `${filler}\ncontato.tardio@example.com`;

  const result = extractContactSignalsFromText(text);

  assert.equal(result.email, undefined);
});
