import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  canonicalLanguageLabel,
  canonicalTechLabel,
  normalize,
} from "../talent-profiles/talent-canonical-mapper";
import type { SearchTalentProfilesDto } from "./dto/search-talent-profiles.dto";

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class AdminTalentProfilesService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}

  async search(dto: SearchTalentProfilesDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.TalentProfileWhereInput = {};

    if (dto.query) {
      where.OR = [
        { fullName: { contains: dto.query, mode: "insensitive" } },
        { primaryEmail: { contains: dto.query, mode: "insensitive" } },
      ];
    }

    // Passa pelo mesmo canonicalizador usado ao gravar (abreviação/apelido
    // vira o mesmo rótulo, ex: "js" casa com "javascript") — sem isso a
    // busca livre não acha nada gravado com o nome canônico.
    if (dto.technology) {
      const term = normalize(canonicalTechLabel(dto.technology));
      where.competencies = {
        some: { valueNormalized: { contains: term, mode: "insensitive" } },
      };
    }

    if (dto.language) {
      const term = normalize(canonicalLanguageLabel(dto.language));
      where.languages = {
        some: { language: { contains: term, mode: "insensitive" } },
      };
    }

    if (
      dto.minYearsExperience !== undefined ||
      dto.maxYearsExperience !== undefined
    ) {
      where.yearsExperience = {
        ...(dto.minYearsExperience !== undefined
          ? { gte: dto.minYearsExperience }
          : {}),
        ...(dto.maxYearsExperience !== undefined
          ? { lte: dto.maxYearsExperience }
          : {}),
      };
    }

    if (dto.seniority) where.seniority = dto.seniority;
    if (dto.primaryArea) where.primaryAreas = { has: dto.primaryArea };

    const [total, profiles] = await Promise.all([
      this.database.talentProfile.count({ where }),
      this.database.talentProfile.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          competencies: {
            where: {
              category: { in: ["TECHNICAL_SKILL", "TOOL", "TECHNOLOGY"] },
            },
            orderBy: { lastObservedAt: "desc" },
            take: 15,
          },
          languages: { orderBy: { language: "asc" } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        userId: profile.userId,
        identityConfidence: profile.identityConfidence,
        fullName: profile.fullName,
        primaryEmail: profile.primaryEmail,
        phone: profile.phone,
        linkedinUrl: profile.linkedinUrl,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        currentTitle: profile.currentTitle,
        seniority: profile.seniority,
        yearsExperience: profile.yearsExperience,
        primaryAreas: profile.primaryAreas,
        technologies: profile.competencies.map((c) => c.valueLabel),
        languages: profile.languages.map((l) => ({
          language: l.language,
          proficiencyLevel: l.proficiencyLevel,
        })),
        lastAnalysisAt: profile.lastAnalysisAt,
        lastInteractionAt: profile.lastInteractionAt,
        lastEnrichedAt: profile.lastEnrichedAt,
      })),
    };
  }
}
