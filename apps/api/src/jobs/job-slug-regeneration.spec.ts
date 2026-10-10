import assert from "node:assert/strict";
import { test } from "node:test";

import { planSlugRegeneration } from "./job-slug-regeneration";

const ID = "cmg1abcdefghijklmnopqrstu";

test("regenera slug e título de vaga com [Job-N] no título", () => {
  const plan = planSlugRegeneration({
    companyName: "CI&T",
    id: ID,
    normalizedTitle: "job-32186 senior ai developer",
    slug: `job-32186-senior-ai-developer-cit-${ID}`,
    title: "[Job-32186] Senior AI Developer",
  });

  assert.deepEqual(plan, {
    baseSlug: `senior-ai-developer-cit-${ID}`,
    normalizedTitle: "senior ai developer",
    reasons: ["job_id_prefix"],
    title: "Senior AI Developer",
  });
});

test("regenera slug de vaga já recrawleada (título limpo, slug com job-N)", () => {
  const plan = planSlugRegeneration({
    companyName: "CI&T",
    id: ID,
    normalizedTitle: "senior ai developer",
    slug: `job-32186-senior-ai-developer-cit-${ID}`,
    title: "Senior AI Developer",
  });

  assert.equal(plan?.baseSlug, `senior-ai-developer-cit-${ID}`);
  assert.deepEqual(plan?.reasons, ["job_id_prefix"]);
  assert.equal(plan?.title, "Senior AI Developer");
});

test("regenera slug de vaga com empresa reatribuída", () => {
  const plan = planSlugRegeneration({
    companyName: "Nava",
    id: ID,
    normalizedTitle: "dev java",
    slug: `dev-java-solutions-${ID}`,
    title: "Dev Java",
  });

  assert.equal(plan?.baseSlug, `dev-java-nava-${ID}`);
  assert.deepEqual(plan?.reasons, ["company_changed"]);
});

test("não mexe em slug correto, nem quando só o título mudou na fonte", () => {
  assert.equal(
    planSlugRegeneration({
      companyName: "Acme",
      id: ID,
      normalizedTitle: "dev java",
      slug: `dev-java-acme-${ID}`,
      title: "Dev Java",
    }),
    null,
  );
  assert.equal(
    planSlugRegeneration({
      companyName: "Acme",
      id: ID,
      normalizedTitle: "dev java senior",
      slug: `dev-java-acme-${ID}_2`,
      title: "Dev Java Sênior",
    }),
    null,
  );
});
