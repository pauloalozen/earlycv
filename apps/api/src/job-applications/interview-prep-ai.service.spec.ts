import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InterviewPrepValidationError,
  validateAndNormalizeInterviewPrep,
} from "./interview-prep-ai.service";

const VALID_INPUT = {
  strategySummary: "Prepare-se bem.",
  strengthsToHighlight: ["Node.js sênior", "Experiência em microsserviços"],
  likelyRisksOrGaps: ["Pouca experiência com Go"],
  questionsTheyMayAsk: [
    { question: "Por que esta empresa?", whyItMatters: "Avalia motivação.", answerDirection: "Seja específico." },
  ],
  questionsCandidateShouldAsk: ["Como é o time?"],
  recommendedPosture: ["Seja objetivo"],
  finalChecklist: ["Pesquise a empresa"],
};

// ─── valid inputs ─────────────────────────────────────────────────────────────

test("accepts a fully valid input without modification", () => {
  const result = validateAndNormalizeInterviewPrep(VALID_INPUT);
  assert.equal(result.strategySummary, "Prepare-se bem.");
  assert.deepEqual(result.strengthsToHighlight, ["Node.js sênior", "Experiência em microsserviços"]);
  assert.equal(result.questionsTheyMayAsk.length, 1);
});

test("trims whitespace from string fields", () => {
  const result = validateAndNormalizeInterviewPrep({
    ...VALID_INPUT,
    strategySummary: "  Prepare-se bem.  ",
    strengthsToHighlight: ["  item com espaço  "],
  });
  assert.equal(result.strategySummary, "Prepare-se bem.");
  assert.equal(result.strengthsToHighlight[0], "item com espaço");
});

// ─── array normalization ──────────────────────────────────────────────────────

test("converts missing array fields to empty arrays", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "Válido.",
  });
  assert.deepEqual(result.strengthsToHighlight, []);
  assert.deepEqual(result.likelyRisksOrGaps, []);
  assert.deepEqual(result.questionsTheyMayAsk, []);
  assert.deepEqual(result.questionsCandidateShouldAsk, []);
  assert.deepEqual(result.recommendedPosture, []);
  assert.deepEqual(result.finalChecklist, []);
});

test("removes null items from string arrays", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "OK.",
    strengthsToHighlight: ["válido", null, undefined, "também válido"],
  });
  assert.deepEqual(result.strengthsToHighlight, ["válido", "também válido"]);
});

test("removes empty string items from string arrays", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "OK.",
    finalChecklist: ["item útil", "", "   ", "outro útil"],
  });
  assert.deepEqual(result.finalChecklist, ["item útil", "outro útil"]);
});

test("removes non-string items from string arrays", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "OK.",
    recommendedPosture: ["string", 42, true, { nested: "obj" }, "outra string"],
  });
  assert.deepEqual(result.recommendedPosture, ["string", "outra string"]);
});

// ─── questionsTheyMayAsk normalization ───────────────────────────────────────

test("removes questions with empty question field", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "OK.",
    questionsTheyMayAsk: [
      { question: "", whyItMatters: "motivo", answerDirection: "direção" },
      { question: "Pergunta válida?", whyItMatters: "motivo", answerDirection: "direção" },
    ],
  });
  assert.equal(result.questionsTheyMayAsk.length, 1);
  assert.equal(result.questionsTheyMayAsk[0].question, "Pergunta válida?");
});

test("fills missing whyItMatters and answerDirection with empty string", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "OK.",
    questionsTheyMayAsk: [
      { question: "Pergunta?" },
    ],
  });
  assert.equal(result.questionsTheyMayAsk[0].whyItMatters, "");
  assert.equal(result.questionsTheyMayAsk[0].answerDirection, "");
});

test("skips non-object items in questionsTheyMayAsk", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "OK.",
    questionsTheyMayAsk: ["string pura", null, 42, { question: "Válida?" }],
  });
  assert.equal(result.questionsTheyMayAsk.length, 1);
});

// ─── minimum content check ────────────────────────────────────────────────────

test("throws InterviewPrepValidationError when all sections are empty", () => {
  assert.throws(
    () => validateAndNormalizeInterviewPrep({
      strategySummary: "",
      strengthsToHighlight: [],
      questionsTheyMayAsk: [],
      finalChecklist: [],
    }),
    (err: Error) => {
      assert.ok(err instanceof InterviewPrepValidationError);
      assert.match(err.message, /empty/i);
      return true;
    },
  );
});

test("accepts input with only strategySummary filled", () => {
  const result = validateAndNormalizeInterviewPrep({ strategySummary: "Suficiente." });
  assert.equal(result.strategySummary, "Suficiente.");
});

test("accepts input with no strategySummary but has strengthsToHighlight", () => {
  const result = validateAndNormalizeInterviewPrep({
    strategySummary: "",
    strengthsToHighlight: ["Ponto forte"],
  });
  assert.equal(result.strategySummary, "");
  assert.equal(result.strengthsToHighlight.length, 1);
});

test("accepts input with only finalChecklist filled", () => {
  const result = validateAndNormalizeInterviewPrep({ finalChecklist: ["Pesquise a empresa."] });
  assert.deepEqual(result.finalChecklist, ["Pesquise a empresa."]);
});

// ─── invalid root types ───────────────────────────────────────────────────────

test("throws when root value is null", () => {
  assert.throws(
    () => validateAndNormalizeInterviewPrep(null),
    InterviewPrepValidationError,
  );
});

test("throws when root value is a string", () => {
  assert.throws(
    () => validateAndNormalizeInterviewPrep("{}"),
    InterviewPrepValidationError,
  );
});

test("throws when root value is an array", () => {
  assert.throws(
    () => validateAndNormalizeInterviewPrep([]),
    InterviewPrepValidationError,
  );
});

test("throws when root value is a number", () => {
  assert.throws(
    () => validateAndNormalizeInterviewPrep(42),
    InterviewPrepValidationError,
  );
});
