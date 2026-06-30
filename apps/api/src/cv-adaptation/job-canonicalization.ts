import { createHash } from "node:crypto";

export type CanonicalJobJson = {
  title: string | null;
  company: string | null;
  location: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  employmentType:
    | "full_time"
    | "part_time"
    | "contract"
    | "internship"
    | "temporary"
    | "freelance"
    | null;
  description: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeRawJobText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildRawJobHash(normalizedRawText: string): string {
  return sha256(normalizedRawText);
}

export function normalizeCanonicalHashInput(text: string): string {
  return normalizeRawJobText(text);
}

export function buildCanonicalHashInput(
  canonicalJob: CanonicalJobJson,
): string {
  return [
    canonicalJob.title ?? "",
    canonicalJob.company ?? "",
    canonicalJob.location ?? "",
    canonicalJob.workMode ?? "",
    canonicalJob.employmentType ?? "",
    canonicalJob.description,
  ].join("\n---\n");
}

export function buildCanonicalJobHash(canonicalJob: CanonicalJobJson): string {
  return sha256(
    normalizeCanonicalHashInput(buildCanonicalHashInput(canonicalJob)),
  );
}

export function buildRequirementSourceHash(
  canonicalJob: Pick<CanonicalJobJson, "description">,
): string {
  return sha256(normalizeCanonicalHashInput(canonicalJob.description));
}
