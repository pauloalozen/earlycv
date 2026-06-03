import type { MasterCvCanonicalExtractionOutput } from "./master-cv-canonical-extraction.types";

const ALLOWED_FIELD_STATUS = new Set(["filled", "partial", "missing"]);

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid extraction payload: ${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid extraction payload: ${path} must be a string`);
  }
  return value;
}

function asNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return asString(value, path);
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid extraction payload: ${path} must be an array`);
  }
  return value.map((entry, index) => asString(entry, `${path}[${index}]`));
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid extraction payload: ${path} must be a number`);
  }
  if (value < 0 || value > 1) {
    throw new Error(
      `Invalid extraction payload: ${path} must be between 0 and 1`,
    );
  }
  return value;
}

export function parseMasterCvCanonicalExtractionPayload(
  input: unknown,
): MasterCvCanonicalExtractionOutput {
  const root = asRecord(input, "root");

  if (!("canonicalProfile" in root)) {
    throw new Error("Invalid extraction payload: canonicalProfile is required");
  }
  if (!("extractionCoverage" in root)) {
    throw new Error(
      "Invalid extraction payload: extractionCoverage is required",
    );
  }
  if (!("confidence" in root)) {
    throw new Error("Invalid extraction payload: confidence is required");
  }
  if (!("evidence" in root)) {
    throw new Error("Invalid extraction payload: evidence is required");
  }

  const extractionCoverage = asRecord(
    root.extractionCoverage,
    "extractionCoverage",
  );
  const fieldStatus = asRecord(
    extractionCoverage.fieldStatus,
    "extractionCoverage.fieldStatus",
  );

  const canonicalProfile = asRecord(root.canonicalProfile, "canonicalProfile");
  asNullableString(canonicalProfile.fullName, "canonicalProfile.fullName");
  asNullableString(canonicalProfile.headline, "canonicalProfile.headline");
  asNullableString(canonicalProfile.email, "canonicalProfile.email");
  asNullableString(canonicalProfile.phone, "canonicalProfile.phone");
  asNullableString(
    canonicalProfile.linkedinUrl,
    "canonicalProfile.linkedinUrl",
  );
  asNullableString(
    canonicalProfile.professionalSummary,
    "canonicalProfile.professionalSummary",
  );

  const location = asRecord(
    canonicalProfile.location,
    "canonicalProfile.location",
  );
  asNullableString(location.city, "canonicalProfile.location.city");
  asNullableString(location.state, "canonicalProfile.location.state");
  asNullableString(location.country, "canonicalProfile.location.country");

  const experiences = canonicalProfile.experiences;
  if (!Array.isArray(experiences)) {
    throw new Error(
      "Invalid extraction payload: canonicalProfile.experiences must be an array",
    );
  }
  experiences.forEach((entry, index) => {
    const experience = asRecord(
      entry,
      `canonicalProfile.experiences[${index}]`,
    );
    asNullableString(
      experience.role,
      `canonicalProfile.experiences[${index}].role`,
    );
    asNullableString(
      experience.company,
      `canonicalProfile.experiences[${index}].company`,
    );
    asNullableString(
      experience.location,
      `canonicalProfile.experiences[${index}].location`,
    );
    asNullableString(
      experience.startDate,
      `canonicalProfile.experiences[${index}].startDate`,
    );
    asNullableString(
      experience.endDate,
      `canonicalProfile.experiences[${index}].endDate`,
    );
    asStringArray(
      experience.bullets,
      `canonicalProfile.experiences[${index}].bullets`,
    );
    asStringArray(
      experience.technologies,
      `canonicalProfile.experiences[${index}].technologies`,
    );
  });

  const education = canonicalProfile.education;
  if (!Array.isArray(education)) {
    throw new Error(
      "Invalid extraction payload: canonicalProfile.education must be an array",
    );
  }
  education.forEach((entry, index) => {
    const item = asRecord(entry, `canonicalProfile.education[${index}]`);
    asNullableString(
      item.institution,
      `canonicalProfile.education[${index}].institution`,
    );
    asNullableString(
      item.degree,
      `canonicalProfile.education[${index}].degree`,
    );
    asNullableString(
      item.fieldOfStudy,
      `canonicalProfile.education[${index}].fieldOfStudy`,
    );
    asNullableString(
      item.startDate,
      `canonicalProfile.education[${index}].startDate`,
    );
    asNullableString(
      item.endDate,
      `canonicalProfile.education[${index}].endDate`,
    );
  });

  asStringArray(canonicalProfile.skills, "canonicalProfile.skills");

  const languages = canonicalProfile.languages;
  if (!Array.isArray(languages)) {
    throw new Error(
      "Invalid extraction payload: canonicalProfile.languages must be an array",
    );
  }
  languages.forEach((entry, index) => {
    const language = asRecord(entry, `canonicalProfile.languages[${index}]`);
    asString(
      language.language,
      `canonicalProfile.languages[${index}].language`,
    );
    asNullableString(
      language.level,
      `canonicalProfile.languages[${index}].level`,
    );
  });

  const certifications = canonicalProfile.certifications;
  if (!Array.isArray(certifications)) {
    throw new Error(
      "Invalid extraction payload: canonicalProfile.certifications must be an array",
    );
  }
  certifications.forEach((entry, index) => {
    const certification = asRecord(
      entry,
      `canonicalProfile.certifications[${index}]`,
    );
    asString(
      certification.name,
      `canonicalProfile.certifications[${index}].name`,
    );
    asNullableString(
      certification.issuer,
      `canonicalProfile.certifications[${index}].issuer`,
    );
    asNullableString(
      certification.year,
      `canonicalProfile.certifications[${index}].year`,
    );
  });

  asStringArray(
    extractionCoverage.identifiedFields,
    "extractionCoverage.identifiedFields",
  );
  asStringArray(
    extractionCoverage.missingFields,
    "extractionCoverage.missingFields",
  );

  for (const [field, status] of Object.entries(fieldStatus)) {
    if (typeof status !== "string" || !ALLOWED_FIELD_STATUS.has(status)) {
      throw new Error(
        `Invalid extraction payload: extractionCoverage.fieldStatus.${field}`,
      );
    }
  }

  const confidence = asRecord(root.confidence, "confidence");
  for (const [field, value] of Object.entries(confidence)) {
    asNumber(value, `confidence.${field}`);
  }

  const evidence = asRecord(root.evidence, "evidence");
  for (const [field, value] of Object.entries(evidence)) {
    asStringArray(value, `evidence.${field}`);
  }

  return input as MasterCvCanonicalExtractionOutput;
}
