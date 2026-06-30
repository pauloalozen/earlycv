import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJobDescription,
  createOpenAIClient,
} from "../../../packages/ai/src/index.ts";

type MatchState = "MATCH" | "DIFFERENT";

type CaseExpectation = {
  rawHash: MatchState;
  canonicalHash: MatchState;
  requirementSourceHash?: MatchState;
  reason: string;
};

type Manifest = {
  cases: Record<string, CaseExpectation>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeRawJobText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildRawJobHash(normalizedRawText: string): string {
  return sha256(normalizedRawText);
}

function buildCanonicalHashInput(canonicalJob: {
  title: string | null;
  company: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  description: string;
}): string {
  return [
    canonicalJob.title ?? "",
    canonicalJob.company ?? "",
    canonicalJob.location ?? "",
    canonicalJob.workMode ?? "",
    canonicalJob.employmentType ?? "",
    canonicalJob.description,
  ].join("\n---\n");
}

function buildCanonicalJobHash(
  canonicalJob: Parameters<typeof buildCanonicalHashInput>[0],
): string {
  return sha256(normalizeRawJobText(buildCanonicalHashInput(canonicalJob)));
}

function buildRequirementSourceHash(canonicalJob: { description: string }) {
  return sha256(normalizeRawJobText(canonicalJob.description));
}

async function collectManifestFiles(root: string): Promise<string[]> {
  const files = (await readdir(root))
    .filter((name) => /^manifest(_[a-z]+)?\.json$/i.test(name))
    .sort();

  if (files.length === 0) {
    throw new Error("No manifest files found");
  }

  return files;
}

async function main() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const root = currentDir;
  const manifestFiles = await collectManifestFiles(root);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run the smoke tests");
  }

  const client = createOpenAIClient({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    organization: process.env.OPENAI_ORG_ID,
    project: process.env.OPENAI_PROJECT_ID,
    timeout: 120000,
  });
  const model =
    process.env.OPENAI_MODEL_JOB_CANONICALIZATION ??
    process.env.OPENAI_MODEL ??
    "gpt-4o-mini";

  const results: Array<{
    manifestFile: string;
    caseName: string;
    observedRaw: MatchState;
    observedCanonical: MatchState;
    observedRequirement: MatchState;
    pass: boolean;
  }> = [];

  for (const manifestFile of manifestFiles) {
    const manifest = JSON.parse(
      await readFile(path.join(root, manifestFile), "utf8"),
    ) as Manifest;

    for (const [shortName, expected] of Object.entries(manifest.cases)) {
      const caseName =
        manifestFile === "manifest_en.json" ? `${shortName}_en` : shortName;
      const caseDir = path.join(root, caseName);
      const txtFiles = (await readdir(caseDir))
        .filter((name) => name.endsWith(".txt"))
        .sort();

      if (txtFiles.length !== 2) {
        throw new Error(
          `${caseName}: expected 2 txt files, got ${txtFiles.length}`,
        );
      }

      const [aFile, bFile] = txtFiles;
      const [aText, bText] = await Promise.all([
        readFile(path.join(caseDir, aFile), "utf8"),
        readFile(path.join(caseDir, bFile), "utf8"),
      ]);

      const rawHashA = buildRawJobHash(normalizeRawJobText(aText));
      const rawHashB = buildRawJobHash(normalizeRawJobText(bText));
      const observedRaw: MatchState =
        rawHashA === rawHashB ? "MATCH" : "DIFFERENT";

      const [canonicalA, canonicalB] = await Promise.all([
        canonicalizeJobDescription(client, model, aText),
        canonicalizeJobDescription(client, model, bText),
      ]);

      const canonicalHashA = buildCanonicalJobHash(canonicalA);
      const canonicalHashB = buildCanonicalJobHash(canonicalB);
      const requirementHashA = buildRequirementSourceHash(canonicalA);
      const requirementHashB = buildRequirementSourceHash(canonicalB);

      const observedCanonical: MatchState =
        canonicalHashA === canonicalHashB ? "MATCH" : "DIFFERENT";
      const observedRequirement: MatchState =
        requirementHashA === requirementHashB ? "MATCH" : "DIFFERENT";

      const pass =
        observedRaw === expected.rawHash &&
        observedCanonical === expected.canonicalHash &&
        (expected.requirementSourceHash === undefined ||
          observedRequirement === expected.requirementSourceHash);

      results.push({
        manifestFile,
        caseName,
        observedRaw,
        observedCanonical,
        observedRequirement,
        pass,
      });
    }
  }

  for (const result of results) {
    console.log(
      `[${result.pass ? "PASS" : "FAIL"}] ${result.caseName} raw=${result.observedRaw} canonical=${result.observedCanonical} requirement=${result.observedRequirement}`,
    );
  }

  const passed = results.filter((result) => result.pass).length;
  console.log(`Summary: ${passed}/${results.length} passed`);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

await main();
