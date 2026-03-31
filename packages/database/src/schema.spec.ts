import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
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

test("Resume models one primary resume per user with a dedicated unique slot", () => {
  const resume = getBlock("model", "Resume");

  assert.match(resume, /^\s*isPrimary\s+Boolean\s+@default\(false\)$/m);
  assert.match(resume, /^\s*primaryResumeSlot\s+Int\?$/m);
  assertContains(
    resume,
    "@@unique([userId, primaryResumeSlot])",
    "Resume should reserve a unique nullable slot for the primary resume invariant",
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
