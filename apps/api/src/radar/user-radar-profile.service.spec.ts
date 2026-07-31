import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRadarProfileService } from "./user-radar-profile.service";

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    radarAreas: [],
    radarSeniority: null,
    skillsJson: { technical: [], business: [], soft: [] },
    languagesJson: [],
    certificationsJson: [],
    experiencesJson: [],
    remotePreference: null,
    ...overrides,
  };
}

function buildService(profile: Record<string, unknown>) {
  const upserts: Array<unknown> = [];
  const service = new UserRadarProfileService({
    userProfile: {
      findUnique: async () => profile,
    },
    userRadarProfile: {
      upsert: async (args: unknown) => {
        upserts.push(args);
        return args;
      },
    },
  } as never);
  return { service, upserts };
}

test("refresh uses radarAreas as-is when already filled, skips inference", async () => {
  const profile = buildProfile({
    radarAreas: ["PRODUCT"],
    skillsJson: { technical: ["python", "sql"], business: [], soft: [] },
  });
  const { service, upserts } = buildService(profile);

  await service.refresh("user-1");

  const args = upserts[0] as { create: { areas: string[] } };
  assert.deepEqual(args.create.areas, ["PRODUCT"]);
});

test("refresh falls back to skills inference when radarAreas is empty", async () => {
  const profile = buildProfile({
    radarAreas: [],
    skillsJson: { technical: ["python", "sql", "airflow"], business: [], soft: [] },
  });
  const { service, upserts } = buildService(profile);

  await service.refresh("user-1");

  const args = upserts[0] as { create: { areas: string[] } };
  assert.deepEqual(args.create.areas, ["DATA_AI"]);
});

test("refresh uses radarSeniority as-is when filled and not UNKNOWN", async () => {
  const profile = buildProfile({
    radarSeniority: "LEAD",
    experiencesJson: [],
  });
  const { service, upserts } = buildService(profile);

  await service.refresh("user-1");

  const args = upserts[0] as { create: { seniority: string } };
  assert.equal(args.create.seniority, "LEAD");
});

test("refresh falls back to experience inference when radarSeniority is UNKNOWN", async () => {
  const profile = buildProfile({
    radarSeniority: "UNKNOWN",
    experiencesJson: [
      { role: "Engenheiro de Software", startDate: "2015-01", endDate: "atual" },
    ],
  });
  const { service, upserts } = buildService(profile);

  await service.refresh("user-1");

  const args = upserts[0] as { create: { seniority: string } };
  assert.equal(args.create.seniority, "SENIOR");
});

test("refresh normalizes skills to lowercase and dedups", async () => {
  const profile = buildProfile({
    skillsJson: {
      technical: ["Python", "python", "SQL"],
      business: ["Excel"],
      soft: ["Comunicação"],
    },
  });
  const { service, upserts } = buildService(profile);

  await service.refresh("user-1");

  const args = upserts[0] as { create: { skills: string[] } };
  assert.deepEqual(args.create.skills.sort(), [
    "comunicação",
    "excel",
    "python",
    "sql",
  ]);
});

test("refresh returns null when the user has no UserProfile yet", async () => {
  const service = new UserRadarProfileService({
    userProfile: { findUnique: async () => null },
    userRadarProfile: { upsert: async () => ({}) },
  } as never);

  const result = await service.refresh("user-without-profile");
  assert.equal(result, null);
});

test("inferAreasFromSkills covers all 7 area keyword groups", () => {
  const service = new UserRadarProfileService({} as never);

  const cases: Array<{ skills: string[]; expected: string }> = [
    { skills: ["python", "power bi"], expected: "DATA_AI" },
    { skills: ["react", "node.js"], expected: "SOFTWARE_ENGINEERING" },
    { skills: ["aws", "kubernetes"], expected: "CLOUD_DEVOPS" },
    { skills: ["pentest", "siem"], expected: "CYBERSECURITY" },
    { skills: ["roadmap", "backlog"], expected: "PRODUCT" },
    { skills: ["figma", "wireframe"], expected: "DESIGN_UX" },
    { skills: ["cypress", "selenium"], expected: "QA_TEST" },
  ];

  for (const { skills, expected } of cases) {
    const areas = service.inferAreasFromSkills({
      technical: skills,
      business: [],
      soft: [],
    } as never);
    assert.ok(
      areas.includes(expected as never),
      `expected ${expected} from skills ${skills.join(",")}, got ${areas.join(",")}`,
    );
  }
});

test("inferAreasFromSkills falls back to SOFTWARE_ENGINEERING when nothing matches", () => {
  const service = new UserRadarProfileService({} as never);
  const areas = service.inferAreasFromSkills({
    technical: ["culinária", "jardinagem"],
    business: [],
    soft: [],
  } as never);
  assert.deepEqual(areas, ["SOFTWARE_ENGINEERING"]);
});

test("inferSeniorityFromExperiences covers year-based bands", () => {
  const service = new UserRadarProfileService({} as never);

  const buildExp = (years: number, role = "Analista") => [
    {
      role,
      startDate: "2015-01",
      endDate: `${2015 + years}-01`,
    },
  ];

  assert.equal(
    service.inferSeniorityFromExperiences([] as never),
    "UNKNOWN",
  );
  assert.equal(
    service.inferSeniorityFromExperiences(buildExp(0.5) as never),
    "INTERN",
  );
  assert.equal(
    service.inferSeniorityFromExperiences(buildExp(2) as never),
    "JUNIOR",
  );
  assert.equal(
    service.inferSeniorityFromExperiences(buildExp(4) as never),
    "MID",
  );
  assert.equal(
    service.inferSeniorityFromExperiences(buildExp(7) as never),
    "SENIOR",
  );
  assert.equal(
    service.inferSeniorityFromExperiences(buildExp(11) as never),
    "SENIOR",
  );
  assert.equal(
    service.inferSeniorityFromExperiences(
      buildExp(7, "Tech Lead") as never,
    ),
    "LEAD",
  );
});
