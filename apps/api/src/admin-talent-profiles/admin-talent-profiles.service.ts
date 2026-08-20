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
const SUGGESTION_LIMIT = 300;

// "javascript, react, ia" -> busca inclusiva (OR): traz quem tem QUALQUER
// um dos termos, não só quem tem todos — é assim que se agrega gente com
// stacks diferentes numa mesma busca.
function parseTerms(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

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
    // busca livre não acha nada gravado com o nome canônico. Cada termo
    // separado por vírgula amplia o resultado (OR), nunca restringe.
    const technologyTerms = parseTerms(dto.technology).map((term) =>
      normalize(canonicalTechLabel(term)),
    );
    if (technologyTerms.length > 0) {
      where.competencies = {
        some: {
          OR: technologyTerms.map((term) => ({
            valueNormalized: { contains: term, mode: "insensitive" },
          })),
        },
      };
    }

    const languageTerms = parseTerms(dto.language).map((term) =>
      normalize(canonicalLanguageLabel(term)),
    );
    if (languageTerms.length > 0) {
      where.languages = {
        some: {
          OR: languageTerms.map((term) => ({
            language: { contains: term, mode: "insensitive" },
          })),
        },
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

    const [total, profiles, technologySuggestions, languageSuggestions] =
      await Promise.all([
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
        this.listTechnologySuggestions(),
        this.listLanguageSuggestions(),
      ]);

    return {
      page,
      pageSize,
      total,
      technologySuggestions,
      languageSuggestions,
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

  // Universo de rótulos já gravados no banco — não filtrado pela busca
  // atual, é o que alimenta o autocomplete (<datalist>) pra mostrar termos
  // parecidos que já existem, evitando busca zerada por digitação diferente
  // do canônico.
  private async listTechnologySuggestions(): Promise<string[]> {
    const rows = await this.database.talentCompetency.findMany({
      where: { category: { in: ["TECHNICAL_SKILL", "TOOL", "TECHNOLOGY"] } },
      distinct: ["valueNormalized"],
      select: { valueLabel: true },
      orderBy: { valueLabel: "asc" },
      take: SUGGESTION_LIMIT,
    });
    return rows.map((row) => row.valueLabel);
  }

  private async listLanguageSuggestions(): Promise<string[]> {
    const rows = await this.database.talentLanguageSkill.findMany({
      distinct: ["language"],
      select: { language: true },
      orderBy: { language: "asc" },
      take: SUGGESTION_LIMIT,
    });
    return rows.map((row) => row.language);
  }
}
