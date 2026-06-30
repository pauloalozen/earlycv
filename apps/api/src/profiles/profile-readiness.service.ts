import { Injectable } from "@nestjs/common";
import type { ProfileReadinessStatus } from "@prisma/client";

import type { CanonicalProfileData } from "./profile-canonical.types";

@Injectable()
export class ProfileReadinessService {
  compute(profile: CanonicalProfileData): ProfileReadinessStatus {
    const hasExperience = profile.experiences.length > 0;
    const hasSkill =
      profile.skills.technical.length +
        profile.skills.business.length +
        profile.skills.soft.length >
      0;
    const hasIdentity = Boolean(
      profile.fullName || profile.headline || profile.professionalSummary,
    );

    if (!hasExperience && !hasSkill && !hasIdentity) {
      return "empty";
    }

    if (hasExperience && hasSkill && hasIdentity) {
      return "ready";
    }

    return "partial";
  }
}
