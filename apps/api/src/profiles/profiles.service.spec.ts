import assert from "node:assert/strict";
import { test } from "node:test";

import { ProfileReadinessService } from "./profile-readiness.service";
import { ProfilesService } from "./profiles.service";

function buildFilledProfile() {
  return {
    userId: "user-1",
    fullName: "Ana Souza",
    headline: "Data Analyst",
    professionalSummary: "Resumo",
    experiencesJson: [{ company: "Acme", role: "Analyst" }],
    educationJson: [],
    skillsJson: { technical: ["SQL"], business: [], soft: [] },
    languagesJson: [],
    certificationsJson: [],
    profileFieldMetaJson: {},
    profileReadinessStatus: "partial",
  };
}

test("update recomputes profileReadinessStatus to empty after clearing all fields", async () => {
  const updates: Array<{ data: Record<string, unknown> }> = [];
  const profile = buildFilledProfile();

  const service = new ProfilesService(
    {
      userProfile: {
        findUnique: async () => profile,
        update: async (args: { data: Record<string, unknown> }) => {
          updates.push(args);
          return { ...profile, ...args.data };
        },
      },
    } as never,
    new ProfileReadinessService(),
  );

  await service.update("user-1", {
    fullName: "",
    contactEmail: "",
    phone: "",
    linkedinUrl: "",
    headline: "",
    city: "",
    state: "",
    country: "",
    professionalSummary: "",
    experiencesJson: [],
    educationJson: [],
    skillsJson: { technical: [], business: [], soft: [] },
    languagesJson: [],
    certificationsJson: [],
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.data.profileReadinessStatus, "empty");
});

test("update keeps profileReadinessStatus consistent with a partial edit", async () => {
  const updates: Array<{ data: Record<string, unknown> }> = [];
  const profile = buildFilledProfile();
  profile.experiencesJson = [];
  profile.skillsJson = { technical: [], business: [], soft: [] };
  profile.profileReadinessStatus = "empty";

  const service = new ProfilesService(
    {
      userProfile: {
        findUnique: async () => profile,
        update: async (args: { data: Record<string, unknown> }) => {
          updates.push(args);
          return { ...profile, ...args.data };
        },
      },
    } as never,
    new ProfileReadinessService(),
  );

  // Only fullName is set; experiences/skills remain empty from the stored
  // profile — readiness should become "partial", not stay stale at "empty".
  await service.update("user-1", { fullName: "Ana Souza" });

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.data.profileReadinessStatus, "partial");
});
