import assert from "node:assert/strict";
import { test } from "node:test";

import { ProfileCanonicalMergeService } from "./profile-canonical-merge.service";
import { ProfileReadinessService } from "./profile-readiness.service";

const service = new ProfileReadinessService();
const mergeService = new ProfileCanonicalMergeService();

test("returns ready only with minimum required fields", () => {
  const status = service.compute({
    fullName: "A",
    experiences: [{ id: "exp_1" }],
    education: [],
    skills: {
      technical: ["SQL"],
      business: [],
      soft: [],
    },
  });

  assert.equal(status, "ready");
});

test("returns partial with some curriculum data but below threshold", () => {
  const status = service.compute({
    experiences: [],
    education: [],
    skills: {
      technical: ["SQL"],
      business: [],
      soft: [],
    },
  });

  assert.equal(status, "partial");
});

test("returns empty when no useful curriculum data", () => {
  const status = service.compute({
    experiences: [],
    education: [],
    skills: {
      technical: [],
      business: [],
      soft: [],
    },
  });

  assert.equal(status, "empty");
});

test("does not overwrite manually edited field and creates pending suggestion", () => {
  const existing = {
    fullName: "Ana Souza",
    phone: "+55 11 98888-1111",
    linkedinUrl: "https://linkedin.com/in/ana-souza",
    professionalSummary: "",
    headline: "Data Analyst",
    experiences: [],
    education: [],
    skills: {
      technical: [],
      business: [],
      soft: [],
    },
  };

  const result = mergeService.merge({
    existing,
    incoming: {
      phone: "+55 (11) 99999-0000",
    },
    source: "base_cv_upload",
    fieldMeta: {
      phone: {
        source: "manual_edit",
        manuallyEdited: true,
      },
    },
    suggestions: [],
  });

  assert.equal(result.next.phone, "+55 11 98888-1111");
  assert.equal(
    result.suggestions.some(
      (suggestion) =>
        suggestion.fieldPath === "phone" && suggestion.status === "pending",
    ),
    true,
  );
});

test("uses stable id paths after experience reorder", () => {
  const result = mergeService.merge({
    existing: {
      experiences: [
        { id: "exp_abc", role: "Analyst", company: "A" },
        { id: "exp_xyz", role: "Engineer", company: "B" },
      ],
      education: [],
      skills: {
        technical: [],
        business: [],
        soft: [],
      },
    },
    incoming: {
      experiences: [
        { id: "exp_xyz", role: "Senior Engineer", company: "B" },
        { id: "exp_abc", role: "Lead Analyst", company: "A" },
      ],
    },
    source: "analysis_upload",
    fieldMeta: {
      "experiences.exp_abc.role": {
        source: "analysis_upload",
      },
    },
    suggestions: [],
  });

  assert.equal(result.next.experiences[0]?.id, "exp_xyz");
  assert.equal(
    result.fieldMeta["experiences.exp_abc.role"] !== undefined,
    true,
  );
  assert.equal(
    result.fieldMeta["experiences.exp_abc.role"]?.source,
    "analysis_upload",
  );
});

test("does not overwrite manually edited nested experience field and creates suggestion", () => {
  const result = mergeService.merge({
    existing: {
      experiences: [{ id: "exp_abc", role: "Staff Analyst", company: "A" }],
      education: [],
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      experiences: [{ id: "exp_abc", role: "Senior Analyst", company: "A" }],
    },
    source: "base_cv_upload",
    fieldMeta: {
      "experiences.exp_abc.role": {
        source: "manual_edit",
        manuallyEdited: true,
      },
    },
    suggestions: [],
  });

  assert.equal(result.next.experiences[0]?.role, "Staff Analyst");
  assert.equal(
    result.suggestions.some(
      (suggestion) =>
        suggestion.fieldPath === "experiences.exp_abc.role" &&
        suggestion.status === "pending",
    ),
    true,
  );
});

test("ignores whitespace-only incoming values", () => {
  const result = mergeService.merge({
    existing: {
      fullName: "Ana",
      experiences: [],
      education: [],
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      fullName: "   ",
    },
    source: "base_cv_upload",
    fieldMeta: {},
    suggestions: [],
  });

  assert.equal(result.next.fullName, "Ana");
});

test("deduplicates repeated pending suggestions for same field/value/source", () => {
  const existing = {
    phone: "+55 11 98888-1111",
    experiences: [],
    education: [],
    skills: { technical: [], business: [], soft: [] },
  };

  const input = {
    existing,
    incoming: { phone: "+55 11 99999-0000" },
    source: "base_cv_upload" as const,
    fieldMeta: {
      phone: { source: "manual_edit" as const, manuallyEdited: true },
    },
    suggestions: [],
  };

  const first = mergeService.merge(input);
  const second = mergeService.merge({
    ...input,
    suggestions: first.suggestions,
  });

  assert.equal(second.suggestions.length, 1);
});

test("accepts base_cv_ai_extraction as merge source", () => {
  const result = mergeService.merge({
    existing: {
      experiences: [],
      education: [],
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      fullName: "Ana Souza",
    },
    source: "base_cv_ai_extraction",
    sourceCvId: "resume-1",
    fieldMeta: {},
    suggestions: [],
  });

  assert.equal(result.next.fullName, "Ana Souza");
  assert.equal(result.fieldMeta.fullName?.source, "base_cv_ai_extraction");
});

test("base_cv_ai_extraction does not overwrite confirmed value on low confidence", () => {
  const result = mergeService.merge({
    existing: {
      fullName: "Valor Confirmado",
      experiences: [],
      education: [],
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      fullName: "Valor Extraido",
    },
    source: "base_cv_ai_extraction",
    sourceCvId: "resume-1",
    fieldMeta: {
      fullName: { source: "manual_edit", manuallyEdited: false },
    },
    suggestions: [],
    extractionContext: {
      confidence: {
        fullName: 0.35,
      },
      extractedAt: "2026-06-01T10:00:00.000Z",
    },
  });

  assert.equal(result.next.fullName, "Valor Confirmado");
});

test("base_cv_ai_extraction stores confidence and timestamp in field meta", () => {
  const extractedAt = "2026-06-01T10:00:00.000Z";
  const result = mergeService.merge({
    existing: {
      experiences: [],
      education: [],
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      fullName: "Ana Souza",
    },
    source: "base_cv_ai_extraction",
    sourceCvId: "resume-1",
    fieldMeta: {},
    suggestions: [],
    extractionContext: {
      confidence: {
        fullName: 0.92,
      },
      extractedAt,
    },
  });

  assert.equal(result.fieldMeta.fullName?.source, "base_cv_ai_extraction");
  assert.equal(result.fieldMeta.fullName?.sourceConfidence, 0.92);
  assert.equal(result.fieldMeta.fullName?.sourceExtractedAt, extractedAt);
});

test("base_cv_ai_extraction keeps existing experiences when experiences confidence is low", () => {
  const existingExperiences = [{ id: "exp_1", role: "Confirmed Role" }];
  const result = mergeService.merge({
    existing: {
      experiences: existingExperiences,
      education: [],
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      experiences: [{ id: "exp_2", role: "Extracted Role" }],
    },
    source: "base_cv_ai_extraction",
    fieldMeta: {},
    suggestions: [],
    extractionContext: {
      confidence: {
        experiences: 0.2,
      },
    },
  });

  assert.deepEqual(result.next.experiences, existingExperiences);
});

test("base_cv_ai_extraction keeps existing education when education confidence is low", () => {
  const existingEducation = [{ id: "edu_1", institution: "USP" }];
  const result = mergeService.merge({
    existing: {
      experiences: [],
      education: existingEducation,
      skills: { technical: [], business: [], soft: [] },
    },
    incoming: {
      education: [{ id: "edu_2", institution: "FGV" }],
    },
    source: "base_cv_ai_extraction",
    fieldMeta: {},
    suggestions: [],
    extractionContext: {
      confidence: {
        education: 0.3,
      },
    },
  });

  assert.deepEqual(result.next.education, existingEducation);
});

test("base_cv_ai_extraction keeps non-empty skill buckets on low confidence", () => {
  const result = mergeService.merge({
    existing: {
      experiences: [],
      education: [],
      skills: { technical: ["SQL"], business: ["Finance"], soft: ["Comms"] },
    },
    incoming: {
      skills: {
        technical: ["Python"],
        business: ["Ops"],
        soft: ["Leadership"],
      },
    },
    source: "base_cv_ai_extraction",
    fieldMeta: {},
    suggestions: [],
    extractionContext: {
      confidence: {
        "skills.technical": 0.1,
        "skills.business": 0.2,
        "skills.soft": 0.3,
      },
    },
  });

  assert.deepEqual(result.next.skills, {
    technical: ["SQL"],
    business: ["Finance"],
    soft: ["Comms"],
  });
});
