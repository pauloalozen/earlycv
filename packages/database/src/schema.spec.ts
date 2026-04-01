import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);

const adminResumeMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260401123000_add_admin_superadmin_resume_templates/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function getBlock(kind: "model" | "enum", name: string) {
  const match = schema.match(
    new RegExp(`${kind}\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"),
  );

  assert.ok(match, `${kind} ${name} should exist`);
  return match[1];
}

function assertContains(haystack: string, needle: string, message: string) {
  assert.equal(haystack.includes(needle), true, message);
}

test("database schema defines the slice-1 domain models", () => {
  for (const model of [
    "User",
    "UserProfile",
    "AuthAccount",
    "RefreshToken",
    "Resume",
    "Company",
    "JobSource",
    "Job",
    "IngestionRun",
  ]) {
    assert.notEqual(
      schema.includes(`model ${model} `),
      false,
      `model ${model} should exist`,
    );
  }
});

test("JobSource tracks ingestion audit runs", () => {
  const jobSource = getBlock("model", "JobSource");

  assertContains(
    jobSource,
    "ingestionRuns        IngestionRun[]",
    "JobSource should expose ingestionRuns relation",
  );
});

test("IngestionRun stores execution counters and preview payload", () => {
  const ingestionRun = getBlock("model", "IngestionRun");

  assert.match(ingestionRun, /^\s*jobSourceId\s+String$/m);
  assert.match(
    ingestionRun,
    /^\s*status\s+IngestionRunStatus\s+@default\(running\)$/m,
  );
  assert.match(ingestionRun, /^\s*newCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*updatedCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*skippedCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*failedCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*previewJson\s+Json\?$/m);
  assert.match(
    ingestionRun,
    /^\s*jobSource\s+JobSource\s+@relation\(fields: \[jobSourceId\], references: \[id\], onDelete: Cascade\)$/m,
  );
});

test("User.email is unique", () => {
  const user = getBlock("model", "User");

  assert.match(user, /^\s*email\s+String\s+@unique$/m);
});

test("AuthAccount is unique by provider identity", () => {
  const authAccount = getBlock("model", "AuthAccount");

  assertContains(
    authAccount,
    "@@unique([provider, providerAccountId])",
    "AuthAccount should enforce unique provider identity",
  );
});

test("Job requires firstSeenAt and enforces canonicalKey uniqueness", () => {
  const job = getBlock("model", "Job");

  assert.match(job, /^\s*firstSeenAt\s+DateTime$/m);
  assert.match(job, /^\s*canonicalKey\s+String\s+@unique$/m);
});

test("admin schema adds internal user roles and staff markers", () => {
  const internalRole = getBlock("enum", "InternalRole");
  const user = getBlock("model", "User");

  for (const expectedValue of ["none", "admin", "superadmin"]) {
    assertContains(
      internalRole,
      expectedValue,
      `InternalRole should include ${expectedValue}`,
    );
  }

  assert.match(user, /^\s*internalRole\s+InternalRole\s+@default\(none\)$/m);
  assert.match(user, /^\s*isStaff\s+Boolean\s+@default\(false\)$/m);
});

test("resume templates include task-1 metadata for reusable baselines", () => {
  const resumeTemplate = getBlock("model", "ResumeTemplate");

  assert.match(resumeTemplate, /^\s*name\s+String$/m);
  assert.match(resumeTemplate, /^\s*slug\s+String\s+@unique$/m);
  assert.match(resumeTemplate, /^\s*targetRole\s+String\?$/m);
  assert.match(resumeTemplate, /^\s*fileUrl\s+String\?$/m);
  assert.match(resumeTemplate, /^\s*structureJson\s+Json\?$/m);
  assert.match(resumeTemplate, /^\s*isActive\s+Boolean\s+@default\(true\)$/m);
  assert.match(resumeTemplate, /^\s*resumes\s+Resume\[]$/m);
});

test("resumes use explicit master and adapted fields without legacy primary slots", () => {
  const resumeKind = getBlock("enum", "ResumeKind");
  const resume = getBlock("model", "Resume");

  for (const expectedValue of ["master", "adapted"]) {
    assertContains(
      resumeKind,
      expectedValue,
      `ResumeKind should include ${expectedValue}`,
    );
  }

  assert.match(resume, /^\s*kind\s+ResumeKind\s+@default\(master\)$/m);
  assert.match(resume, /^\s*isMaster\s+Boolean\s+@default\(true\)$/m);
  assert.match(resume, /^\s*basedOnResumeId\s+String\?$/m);
  assert.match(resume, /^\s*templateId\s+String\?$/m);
  assert.match(resume, /^\s*targetJobId\s+String\?$/m);
  assert.match(resume, /^\s*targetJobTitle\s+String\?$/m);
  assert.match(
    resume,
    /^\s*basedOnResume\s+Resume\?\s+@relation\("ResumeDerivation", fields: \[basedOnResumeId\], references: \[id\], onDelete: SetNull\)$/m,
  );
  assert.match(
    resume,
    /^\s*derivedResumes\s+Resume\[]\s+@relation\("ResumeDerivation"\)$/m,
  );
  assert.match(
    resume,
    /^\s*template\s+ResumeTemplate\?\s+@relation\(fields: \[templateId\], references: \[id\], onDelete: SetNull\)$/m,
  );
  assert.match(
    resume,
    /^\s*targetJob\s+Job\?\s+@relation\(fields: \[targetJobId\], references: \[id\], onDelete: SetNull\)$/m,
  );
  assert.equal(
    /\bisPrimary\b/.test(resume),
    false,
    "Resume should not include isPrimary",
  );
  assert.equal(
    /\bprimaryResumeSlot\b/.test(resume),
    false,
    "Resume should not include primaryResumeSlot",
  );
  assert.equal(
    resume.includes("@@unique([userId, primaryResumeSlot])"),
    false,
    "Resume should not keep the primary resume unique slot",
  );
  assert.equal(
    resume.includes("@@index([userId, isPrimary])"),
    false,
    "Resume should not keep the primary resume index",
  );
});

test("resume migration guards master and adapted invariants", () => {
  assertContains(
    adminResumeMigration,
    'CHECK (NOT "isMaster" OR "kind" = \'master\')',
    "Migration should only allow isMaster for master resumes",
  );
  assert.match(
    adminResumeMigration,
    /CHECK \(\s*"kind" <> 'adapted'\s*OR "basedOnResumeId" IS NOT NULL\s*OR "templateId" IS NOT NULL\s*OR "targetJobId" IS NOT NULL\s*OR "targetJobTitle" IS NOT NULL\s*\)/m,
  );
});

test("enum values use lowercase API-aligned identifiers", () => {
  const authProvider = getBlock("enum", "AuthProvider");
  const userStatus = getBlock("enum", "UserStatus");
  const resumeStatus = getBlock("enum", "ResumeStatus");
  const jobSourceType = getBlock("enum", "JobSourceType");
  const crawlStrategy = getBlock("enum", "CrawlStrategy");
  const jobStatus = getBlock("enum", "JobStatus");
  const ingestionRunStatus = getBlock("enum", "IngestionRunStatus");

  for (const expectedValue of ["credentials", "google", "linkedin"]) {
    assertContains(
      authProvider,
      expectedValue,
      `AuthProvider should include ${expectedValue}`,
    );
  }

  for (const expectedValue of ["active", "pending", "suspended", "deleted"]) {
    assertContains(
      userStatus,
      expectedValue,
      `UserStatus should include ${expectedValue}`,
    );
  }

  for (const expectedValue of ["draft", "uploaded", "reviewed", "failed"]) {
    assertContains(
      resumeStatus,
      expectedValue,
      `ResumeStatus should include ${expectedValue}`,
    );
  }

  for (const expectedValue of [
    "workday",
    "greenhouse",
    "lever",
    "gupy",
    "kenoby",
    "successfactors",
    "custom_html",
    "custom_api",
  ]) {
    assertContains(
      jobSourceType,
      expectedValue,
      `JobSourceType should include ${expectedValue}`,
    );
  }

  for (const expectedValue of ["html", "api", "feed"]) {
    assertContains(
      crawlStrategy,
      expectedValue,
      `CrawlStrategy should include ${expectedValue}`,
    );
  }

  for (const expectedValue of ["active", "inactive", "removed"]) {
    assertContains(
      jobStatus,
      expectedValue,
      `JobStatus should include ${expectedValue}`,
    );
  }

  for (const expectedValue of ["running", "completed", "failed"]) {
    assertContains(
      ingestionRunStatus,
      expectedValue,
      `IngestionRunStatus should include ${expectedValue}`,
    );
  }
});
