import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import {
  companyNameTokens,
  isStrictLiteralSlugHost,
  MATCH_THRESHOLD,
  normToken,
  scoreUrlAgainstCompany,
} from "./company-source-audit-heuristics";

const REVIEW_THRESHOLD = 0.4;

type CompanyRow = {
  id: string;
  name: string;
  websiteUrl: string | null;
  careersUrl: string | null;
};

type CandidateField = {
  field: "websiteUrl" | "careersUrl" | "sourceUrl";
  url: string;
  jobSourceId: string | null;
};

export type AuditTier = "confirmed" | "high" | "review";
export type AuditStatus = "pending" | "approved" | "rejected" | "applied";

export type AuditRunSummary = {
  found: number;
  created: number;
  updated: number;
  skippedReviewed: number;
};

export type ApplySummary = {
  dryRun: boolean;
  processed: number;
  jobSourcesDisabled: number;
  companyFieldsCleared: number;
  jobsReassigned: number;
  jobsRemoved: number;
};

function tierFor(score: number): AuditTier | null {
  if (score >= REVIEW_THRESHOLD && score < MATCH_THRESHOLD) return "review";
  return null;
}

function safeHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Saneamento de fontes: compara Company.websiteUrl/careersUrl e
// JobSource.sourceUrl contra o nome da empresa dona pra achar casos como o
// que motivou isso — "VERACEL" (usina de celulose) com careersUrl apontando
// pro board de vagas da "Vercel" (empresa de infra de deploy).
//
// Usado tanto pelos scripts de terminal (apps/api/src/scripts/
// audit-company-sources.ts e apply-company-source-audit.ts, pra rodar
// contra prod fora do ciclo de request) quanto pelo endpoint admin (aba
// "Audit de Fontes" em /admin/ingestion) — mesma logica, uma fonte de
// verdade so.
//
// runAudit() e so-leitura + upsert na fila de revisao (JobSourceAudit) —
// nunca mexe em Company/JobSource/Job. applyApproved() e quem aplica, e so
// processa linhas com status="approved" (decidido manualmente via decide()
// ou pela tela admin).
@Injectable()
export class CompanySourceAuditService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async runAudit(): Promise<AuditRunSummary> {
    const companies: CompanyRow[] = await this.database.company.findMany({
      select: { id: true, name: true, websiteUrl: true, careersUrl: true },
    });
    const jobSources = await this.database.jobSource.findMany({
      select: { id: true, companyId: true, sourceUrl: true },
    });

    const jobSourcesByCompany = new Map<string, typeof jobSources>();
    for (const js of jobSources) {
      const list = jobSourcesByCompany.get(js.companyId) ?? [];
      list.push(js);
      jobSourcesByCompany.set(js.companyId, list);
    }

    // Indice nome-token -> empresas donas, pra achar o tier "confirmed":
    // uma URL cujo slug bate com o nome de outra Company nossa. Indexa
    // tanto as palavras individuais do nome ("Grupo Pão de Açúcar" ->
    // "grupo"/"pao"/"acucar", sem stopword) quanto o nome inteiro
    // normalizado e colado ("C&A Brasil" -> "cabrasil") — o slug de um ATS
    // as vezes e a junção do nome todo (sem espaço) em vez de uma palavra
    // isolada, e so a tokenizacao por palavra perderia esse caso.
    const tokenIndex = new Map<string, CompanyRow[]>();
    const indexToken = (token: string, company: CompanyRow) => {
      if (!token || token.length < 3) return;
      const list = tokenIndex.get(token) ?? [];
      if (!list.includes(company)) list.push(company);
      tokenIndex.set(token, list);
    };
    for (const company of companies) {
      for (const token of companyNameTokens(company.name)) {
        indexToken(token, company);
      }
      indexToken(normToken(company.name), company);
    }

    const summary: AuditRunSummary = {
      found: 0,
      created: 0,
      updated: 0,
      skippedReviewed: 0,
    };

    for (const company of companies) {
      const candidates: CandidateField[] = [];
      if (company.websiteUrl) {
        candidates.push({
          field: "websiteUrl",
          url: company.websiteUrl,
          jobSourceId: null,
        });
      }
      if (company.careersUrl) {
        candidates.push({
          field: "careersUrl",
          url: company.careersUrl,
          jobSourceId: null,
        });
      }
      for (const js of jobSourcesByCompany.get(company.id) ?? []) {
        candidates.push({
          field: "sourceUrl",
          url: js.sourceUrl,
          jobSourceId: js.id,
        });
      }

      for (const candidate of candidates) {
        const { score, matchedToken } = scoreUrlAgainstCompany(
          candidate.url,
          company.name,
        );
        if (score >= MATCH_THRESHOLD) continue; // parece correto, nada a fazer

        // Sem nenhum token de identidade extraivel na URL (plataforma
        // desconhecida sem padrao mapeado) e score=0 sem match nenhum: nao
        // da pra afirmar nada com confianca — nao gera achado.
        if (score === 0 && matchedToken === null) continue;

        let tier: AuditTier = "high";
        let suspectedOwnerId: string | null = null;
        let suspectedOwnerName: string | null = null;

        if (matchedToken) {
          const owners = (tokenIndex.get(matchedToken) ?? []).filter(
            (owner) => owner.id !== company.id,
          );
          if (owners.length === 1) {
            tier = "confirmed";
            suspectedOwnerId = owners[0]?.id ?? null;
            suspectedOwnerName = owners[0]?.name ?? null;
          } else if (owners.length > 1) {
            // Ambiguo (o slug bate com mais de uma empresa nossa) — melhor
            // deixar pra revisao humana decidir qual delas e a dona real.
            tier = "review";
            suspectedOwnerName = owners.map((o) => o.name).join(" | ");
          }
        }

        if (tier === "high") {
          // Sem cruzamento com outra Company nossa: so vira achado se a
          // plataforma tiver slug confiavelmente literal (ver
          // STRICT_LITERAL_SLUG_HOSTS) — nas BR (Gupy/Pandape/Teamtailor/
          // Solides) o subdominio costuma ser sigla/slogan/nome de grupo, e
          // baixa semelhanca textual sozinha gera falso positivo demais
          // pra virar item de fila.
          const host = safeHost(candidate.url);
          if (!host || !isStrictLiteralSlugHost(host)) continue;

          const reviewTier = tierFor(score);
          if (reviewTier) tier = reviewTier;
        }

        summary.found += 1;

        const existing = await this.database.jobSourceAudit.findUnique({
          where: {
            companyId_field_currentUrl: {
              companyId: company.id,
              field: candidate.field,
              currentUrl: candidate.url,
            },
          },
        });

        if (existing) {
          if (existing.status !== "pending") {
            summary.skippedReviewed += 1;
            continue;
          }
          await this.database.jobSourceAudit.update({
            where: { id: existing.id },
            data: {
              jobSourceId: candidate.jobSourceId,
              tier,
              confidence: score,
              suspectedOwnerId,
              suspectedOwnerName,
            },
          });
          summary.updated += 1;
          continue;
        }

        await this.database.jobSourceAudit.create({
          data: {
            companyId: company.id,
            jobSourceId: candidate.jobSourceId,
            field: candidate.field,
            currentUrl: candidate.url,
            tier,
            confidence: score,
            suspectedOwnerId,
            suspectedOwnerName,
          },
        });
        summary.created += 1;
      }
    }

    return summary;
  }

  async listFindings(params: {
    status?: AuditStatus;
    tier?: AuditTier;
    search?: string;
  }) {
    return this.database.jobSourceAudit.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.tier ? { tier: params.tier } : {}),
        ...(params.search
          ? {
              OR: [
                {
                  currentUrl: { contains: params.search, mode: "insensitive" },
                },
                {
                  suspectedOwnerName: {
                    contains: params.search,
                    mode: "insensitive",
                  },
                },
                {
                  company: {
                    name: { contains: params.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        suspectedOwner: { select: { id: true, name: true } },
      },
      orderBy: [{ tier: "asc" }, { confidence: "asc" }],
    });
  }

  async countByStatus() {
    const rows = await this.database.jobSourceAudit.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts: Record<AuditStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
    };
    for (const row of rows) {
      counts[row.status as AuditStatus] = row._count._all;
    }
    return counts;
  }

  async decide(
    id: string,
    params: { status: "approved" | "rejected"; note?: string },
  ) {
    const existing = await this.database.jobSourceAudit.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("audit finding not found");

    return this.database.jobSourceAudit.update({
      where: { id },
      data: {
        status: params.status,
        reviewedAt: new Date(),
        ...(params.note !== undefined ? { reviewNote: params.note } : {}),
      },
    });
  }

  async applyApproved(params: { dryRun: boolean }): Promise<ApplySummary> {
    const { dryRun } = params;
    const approved = await this.database.jobSourceAudit.findMany({
      where: { status: "approved" },
      orderBy: { detectedAt: "asc" },
    });

    const summary: ApplySummary = {
      dryRun,
      processed: approved.length,
      jobSourcesDisabled: 0,
      companyFieldsCleared: 0,
      jobsReassigned: 0,
      jobsRemoved: 0,
    };

    for (const audit of approved) {
      if (audit.field === "careersUrl" || audit.field === "websiteUrl") {
        if (!dryRun) {
          await this.database.company.update({
            where: { id: audit.companyId },
            data: { [audit.field]: null },
          });
        }
        summary.companyFieldsCleared += 1;
        await this.markApplied(audit.id, dryRun);
        continue;
      }

      // field === "sourceUrl"
      if (!audit.jobSourceId) continue;

      if (!dryRun) {
        await this.database.jobSource.update({
          where: { id: audit.jobSourceId },
          data: {
            isActive: false,
            pauseReason: `saneamento-fontes: URL nao pertence a esta empresa (auditoria ${audit.id}, tier=${audit.tier})`,
          },
        });
      }
      summary.jobSourcesDisabled += 1;

      let destination: { companyId: string; jobSourceId: string } | null = null;

      if (audit.tier === "confirmed" && audit.suspectedOwnerId) {
        const correctSource = await this.database.jobSource.findFirst({
          where: {
            companyId: audit.suspectedOwnerId,
            sourceUrl: audit.currentUrl,
            isActive: true,
          },
        });
        if (correctSource) {
          destination = {
            companyId: audit.suspectedOwnerId,
            jobSourceId: correctSource.id,
          };
        }
      }

      if (destination) {
        if (!dryRun) {
          const result = await this.database.job.updateMany({
            where: { jobSourceId: audit.jobSourceId },
            data: {
              companyId: destination.companyId,
              jobSourceId: destination.jobSourceId,
            },
          });
          summary.jobsReassigned += result.count;
        } else {
          summary.jobsReassigned += await this.database.job.count({
            where: { jobSourceId: audit.jobSourceId },
          });
        }
      } else {
        if (!dryRun) {
          const result = await this.database.job.updateMany({
            where: {
              jobSourceId: audit.jobSourceId,
              status: { not: "removed" },
            },
            data: { status: "removed" },
          });
          summary.jobsRemoved += result.count;
        } else {
          summary.jobsRemoved += await this.database.job.count({
            where: {
              jobSourceId: audit.jobSourceId,
              status: { not: "removed" },
            },
          });
        }
      }

      await this.markApplied(audit.id, dryRun);
    }

    return summary;
  }

  private async markApplied(id: string, dryRun: boolean) {
    if (dryRun) return;
    await this.database.jobSourceAudit.update({
      where: { id },
      data: { status: "applied", appliedAt: new Date() },
    });
  }
}
