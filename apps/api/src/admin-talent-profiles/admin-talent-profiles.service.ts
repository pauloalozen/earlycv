import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";
import {
  canonicalLanguageLabel,
  canonicalTechLabel,
  normalize,
} from "../talent-profiles/talent-canonical-mapper";
import type { SearchTalentProfilesDto } from "./dto/search-talent-profiles.dto";

const DEFAULT_PAGE_SIZE = 20;
// Cobre o universo inteiro de rótulos distintos hoje (~4k tecnologias, bem
// menos idiomas) — um limite baixo e alfabético cortava exatamente os
// termos mais comuns (java/react/typescript vêm depois de milhares de
// variações de outras ferramentas em ordem alfabética).
const SUGGESTION_LIMIT = 10_000;

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
    @Inject(StorageService)
    private readonly storage: StorageService,
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
              orderBy: { valueLabel: "asc" },
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
        // Heurística barata pra decidir se mostra o link "ver CV" na
        // listagem sem pagar o custo da cadeia completa de resolução (só
        // roda de verdade quando clica) — cobre cadastrado (quase sempre
        // acha master/adaptação) e guest com origem conhecida.
        hasCvSource: Boolean(
          profile.userId ||
            (profile.originSourceRecordType === "AnalysisCvSnapshot" &&
              profile.originSourceRecordId),
        ),
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

  // Resolve o CV de verdade pra "ver CV" — mesma ordem de prioridade do
  // enriquecimento por IA (enrich-talent-profiles-ai.ts): Resume master de
  // quem tem conta primeiro (é o texto mais confiável/atual, já sai como
  // texto puro — não tem storage key própria); sem master, cai pro
  // snapshot da análise mais recente que virou Kit de Candidatura; sem
  // isso, cai pro TalentIdentitySignal (guest); só por último usa o
  // originSourceRecordId gravado na criação do profile. Guest e usuário
  // cadastrado passam pela mesma cadeia — um usuário sem master mas com
  // histórico de análises ainda acha o CV.
  async resolveCvSource(
    talentProfileId: string,
  ): Promise<
    | { kind: "text"; text: string }
    | { kind: "url"; url: string }
    | { kind: "none" }
  > {
    const profile = await this.database.talentProfile.findUnique({
      where: { id: talentProfileId },
      select: {
        userId: true,
        originSourceRecordType: true,
        originSourceRecordId: true,
      },
    });
    if (!profile) throw new NotFoundException("talent profile not found");

    if (profile.userId) {
      const resume = await this.database.resume.findFirst({
        where: {
          userId: profile.userId,
          isMaster: true,
          rawText: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        select: { rawText: true },
      });
      if (resume?.rawText) return { kind: "text", text: resume.rawText };

      const adaptation = await this.database.cvAdaptation.findFirst({
        where: { userId: profile.userId, analysisCvSnapshotId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { analysisCvSnapshotId: true },
      });
      if (adaptation?.analysisCvSnapshotId) {
        const url = await this.snapshotUrl(adaptation.analysisCvSnapshotId);
        if (url) return { kind: "url", url };
      }
    }

    const signal = await this.database.talentIdentitySignal.findFirst({
      where: { talentProfileId, sourceRecordType: "AnalysisCvSnapshot" },
      orderBy: { createdAt: "desc" },
      select: { sourceRecordId: true },
    });
    if (signal) {
      const url = await this.snapshotUrl(signal.sourceRecordId);
      if (url) return { kind: "url", url };
    }

    if (
      profile.originSourceRecordType === "AnalysisCvSnapshot" &&
      profile.originSourceRecordId
    ) {
      const url = await this.snapshotUrl(profile.originSourceRecordId);
      if (url) return { kind: "url", url };
    }

    return { kind: "none" };
  }

  // Prioriza o arquivo original enviado; sem arquivo (CV colado como
  // texto ou vindo do perfil salvo), cai pro texto extraído (o .md
  // gerado na análise).
  private async snapshotUrl(snapshotId: string): Promise<string | null> {
    const snapshot = await this.database.analysisCvSnapshot.findUnique({
      where: { id: snapshotId },
      select: { originalFileStorageKey: true, textStorageKey: true },
    });
    if (!snapshot) return null;

    const key = snapshot.originalFileStorageKey ?? snapshot.textStorageKey;
    if (!key) return null;

    return this.storage.getPresignedUrl(key);
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
