import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import {
  isForeignLocation,
  isRecognizedForeignRegion,
  normalizeState,
} from "../jobs/geo-normalizer";

export type ForeignJobCleanupFinding = {
  jobId: string;
  companyName: string;
  title: string;
  country: string | null;
  state: string | null;
  status: string;
  sourceUrl: string | null;
};

export type ForeignJobsCleanupPreview = {
  checked: number;
  foreign: ForeignJobCleanupFinding[];
  ambiguous: ForeignJobCleanupFinding[];
};

export type ForeignJobsCleanupApplySummary = {
  dryRun: boolean;
  removed: number;
  skippedAmbiguous: number;
};

// Saneamento retroativo: vaga fora do Brasil nunca deveria ter Job criado
// (ver isForeignLocation() em jobs/geo-normalizer.ts, checado em
// ingestion.service.ts/upsertObservation ANTES de criar/atualizar), mas
// esse filtro só vale pra cima — não limpa quem já entrou errado antes de
// o filtro existir, ou por causa de bug nele (ex: Anthropic entrou via
// saneamento de fontes; fontes mistas Teamtailor como IN-HAUS INDUSTRIAL
// nunca passam pelo audit-company-sources porque teamtailor não é
// STRICT_LITERAL_SLUG_HOST — o board em si não está errado, só falta
// filtro por vaga).
//
// preview()/apply() reaproveitam a MESMA isForeignLocation() já usada na
// ingestão — mesmo critério que decide o que aceitar na entrada vale pra
// limpar o que já está dentro. apply() fecha (status="removed") só a vaga
// estrangeira; a fonte e as vagas brasileiras da mesma fonte não são
// tocadas (ex: IN-HAUS mantém o São Paulo, perde só os do Panamá).
//
// "ambiguous": sigla de 2 letras isolada no campo country colide com
// código ISO-3166-1 alpha-2 de país real (RO=Romênia/Rondônia,
// PA=Panamá/Pará, SE=Suécia/Sergipe...) — achado auditando XP Inc./Inter,
// cujo parser de origem grava a UF (ex: "SP", "MG") no campo country por
// engano. isForeignLocation() rejeita esse valor de propósito (nunca
// resolve sigla isolada como Brasil, pra não reabrir o bug real do LOUIS
// DREYFUS RO=Romênia). Certo pra INGESTÃO (mais vale perder uma vaga BR
// rara que aceitar uma estrangeira); errado pra LIMPEZA RETROATIVA de
// vaga já publicada, onde o risco de fechar vaga BR real (XP Inc./Inter
// têm vaga ATIVA hoje) pesa mais. apply() nunca remove esse caso — fica
// só no preview, pra decisão manual.
@Injectable()
export class ForeignJobsCleanupService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  private isAmbiguousBrazilianUf(
    country: string | null,
    state: string | null,
  ): boolean {
    const trimmed = country?.trim() ?? "";
    if (!/^[a-zA-Z]{2}$/.test(trimmed) || normalizeState(trimmed) === null) {
      return false;
    }
    return !isRecognizedForeignRegion(state);
  }

  private async collect(): Promise<{
    checked: number;
    foreign: ForeignJobCleanupFinding[];
    ambiguous: ForeignJobCleanupFinding[];
  }> {
    const jobs = await this.database.job.findMany({
      where: { status: { not: "removed" } },
      select: {
        id: true,
        title: true,
        country: true,
        state: true,
        status: true,
        company: { select: { name: true } },
        jobSource: { select: { sourceUrl: true } },
      },
    });

    const foreign: ForeignJobCleanupFinding[] = [];
    const ambiguous: ForeignJobCleanupFinding[] = [];

    for (const job of jobs) {
      if (!isForeignLocation(job.country, job.state)) continue;

      const finding: ForeignJobCleanupFinding = {
        companyName: job.company.name,
        country: job.country,
        jobId: job.id,
        sourceUrl: job.jobSource?.sourceUrl ?? null,
        state: job.state,
        status: job.status,
        title: job.title,
      };

      if (this.isAmbiguousBrazilianUf(job.country, job.state)) {
        ambiguous.push(finding);
      } else {
        foreign.push(finding);
      }
    }

    return { ambiguous, checked: jobs.length, foreign };
  }

  async preview(): Promise<ForeignJobsCleanupPreview> {
    const { checked, foreign, ambiguous } = await this.collect();
    return { ambiguous, checked, foreign };
  }

  async apply(params: {
    dryRun: boolean;
  }): Promise<ForeignJobsCleanupApplySummary> {
    const { foreign, ambiguous } = await this.collect();

    if (!params.dryRun && foreign.length > 0) {
      await this.database.job.updateMany({
        where: { id: { in: foreign.map((f) => f.jobId) } },
        data: { status: "removed" },
      });
    }

    return {
      dryRun: params.dryRun,
      removed: foreign.length,
      skippedAmbiguous: ambiguous.length,
    };
  }
}
