import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { isForeignLocation } from "../jobs/geo-normalizer";
import {
  companyNameTokens,
  isSameBoard,
  isStrictLiteralSlugHost,
  MATCH_THRESHOLD,
  normToken,
  scoreUrlAgainstCompany,
} from "./company-source-audit-heuristics";
import { normalizeCompanyName } from "./name-normalization";

const REVIEW_THRESHOLD = 0.4;

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

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
  jobSourcesCreated: number;
  companiesCreated: number;
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
//
// applyApproved() — sempre desativa primeiro a JobSource errada
// (isActive=false + pauseReason). Depois, pra decidir o que fazer com as
// vagas ja importadas por ela:
//
//   - tier "confirmed" (dono real ja e uma Company nossa): procura entre
//     as fontes do dono real (ativas OU pausadas) uma que seja o MESMO
//     board (isSameBoard — compara por identidade, nao string exata, pra
//     nao perder caso de barra final/maiuscula/dominio de provedor
//     migrado). Achando, reatribui as vagas pra ela. Nao achando, CRIA uma
//     nova JobSource nesse dono (copiando parserKey/sourceType/
//     crawlStrategy da fonte errada) e reatribui pra essa fonte nova, ja
//     ativa.
//   - tier "high"/"review" com sugestao de nome unica (nao um match
//     ambiguo entre varias empresas nossas, e nao um board claramente
//     estrangeiro — ver isForeignBoard): cria (ou reaproveita, se outro
//     achado ja criou) um RASCUNHO de Company com esse nome, isActive=false
//     — nao aparece em listagem publica nem entra em lote de crawling ate
//     revisao manual — mais uma JobSource tambem pausada, e reatribui as
//     vagas pra la com status="inactive" (preservadas, so fora do radar ate
//     voce revisar/ativar a empresa, ver "Rascunhos" na aba Audit de
//     Fontes). Assim nenhum achado de fonte se perde so por a empresa dona
//     ainda nao existir no nosso banco.
//   - tier "review" com match AMBIGUO entre varias empresas nossas (nao da
//     pra saber sozinho qual delas e a dona real), OU um board cujas vagas
//     ja importadas sao TODAS de fora do Brasil (isForeignBoard — reusa
//     isForeignLocation, o mesmo criterio da ingestao normal — entao nao
//     vale criar rascunho de empresa pra isso): fica no comportamento
//     seguro anterior — so desativa a fonte errada e marca as vagas como
//     "removed". Precisa de decisao manual (ainda nao tem UI pra escolher
//     entre os candidatos).
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
          } else {
            // Nenhuma Company nossa bate: sem suspectedOwnerId (nao sabemos
            // quem e), mas guarda um nome sugerido a partir do proprio slug
            // — usado como nome do rascunho de empresa que o apply cria
            // quando essa linha for aprovada (ver applyApproved).
            suspectedOwnerName = titleCase(matchedToken);
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
      jobSourcesCreated: 0,
      companiesCreated: 0,
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

      const wrongSource = await this.database.jobSource.findUnique({
        where: { id: audit.jobSourceId },
      });
      if (!wrongSource) continue;

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

      // Resolve a Company de destino: o dono confirmado (ja existe no
      // nosso banco), OU — se ninguem confirmado mas temos um nome
      // sugerido de UM candidato so (nao a lista "A | B" de match ambiguo,
      // que precisa de decisao humana manual, e nao um board claramente
      // estrangeiro sem nenhuma vaga no Brasil) — um RASCUNHO de empresa,
      // reaproveitado se outro achado ja criou um com esse mesmo nome.
      let destinationCompanyId: string | null = audit.suspectedOwnerId;
      const isAmbiguousMultiOwner =
        !destinationCompanyId &&
        (audit.suspectedOwnerName?.includes(" | ") ?? false);

      // So decide isso quando ainda vamos criar rascunho (dono desconhecido
      // no nosso banco) — pra um dono ja confirmado (Company nossa de
      // verdade) a localizacao das vagas nao muda a decisao de reatribuir.
      let isForeignBoard = false;
      if (!destinationCompanyId && !isAmbiguousMultiOwner) {
        const wrongSourceJobs = await this.database.job.findMany({
          where: { jobSourceId: audit.jobSourceId },
          select: { country: true, state: true },
        });
        isForeignBoard =
          wrongSourceJobs.length > 0 &&
          wrongSourceJobs.every((job) =>
            isForeignLocation(job.country, job.state),
          );
      }

      let willCreateDraftInDryRun = false;

      if (
        !destinationCompanyId &&
        audit.suspectedOwnerName &&
        !isAmbiguousMultiOwner &&
        !isForeignBoard
      ) {
        const normalizedName = normalizeCompanyName(audit.suspectedOwnerName);
        if (normalizedName) {
          const existingDraft = await this.database.company.findUnique({
            where: { normalizedName },
          });
          if (existingDraft) {
            destinationCompanyId = existingDraft.id;
          } else if (!dryRun) {
            // isActive=false: nao aparece em nenhuma listagem publica nem
            // entra em lote de crawling ate voce revisar (renomear se
            // preciso) e ativar pela propria aba Audit de Fontes.
            const draft = await this.database.company.create({
              data: {
                name: audit.suspectedOwnerName,
                normalizedName,
                careersUrl: audit.currentUrl,
                isActive: false,
              },
            });
            destinationCompanyId = draft.id;
            summary.companiesCreated += 1;
            await this.database.jobSourceAudit.update({
              where: { id: audit.id },
              data: { suspectedOwnerId: draft.id },
            });
          } else {
            willCreateDraftInDryRun = true;
            summary.companiesCreated += 1;
          }
        }
      }

      let destination: { companyId: string; jobSourceId: string } | null = null;

      if (destinationCompanyId) {
        // Mesmo board, URL so difere de forma cosmetica (barra final,
        // maiuscula, migracao de dominio do provedor) — nao exige URL
        // identica nem fonte ativa: a atribuicao (de quem e a vaga) e
        // independente de estarmos crawleando ali agora.
        const ownerSources = await this.database.jobSource.findMany({
          where: { companyId: destinationCompanyId },
        });
        const correctSource = ownerSources.find((source) =>
          isSameBoard(audit.currentUrl, source.sourceUrl),
        );

        if (correctSource) {
          destination = {
            companyId: destinationCompanyId,
            jobSourceId: correctSource.id,
          };
        } else {
          // Dono (confirmado ou rascunho) ainda nao tem NENHUMA fonte pra
          // esse board — cria uma nova (copiando adapter/config da fonte
          // errada, que e a mesma URL/plataforma, so com o nome errado) em
          // vez de so descartar a vaga. Fonte de rascunho nasce pausada
          // (isActive=false) ate voce revisar a empresa.
          const ownerName = audit.suspectedOwnerName ?? "Empresa";
          if (!dryRun) {
            const created = await this.database.jobSource.create({
              data: {
                companyId: destinationCompanyId,
                sourceUrl: audit.currentUrl,
                sourceName: `${ownerName} careers`,
                sourceType: wrongSource.sourceType,
                parserKey: wrongSource.parserKey,
                crawlStrategy: wrongSource.crawlStrategy,
                checkIntervalMinutes: wrongSource.checkIntervalMinutes,
                isFallbackAdapter: wrongSource.isFallbackAdapter,
                isActive: audit.tier === "confirmed",
              },
            });
            destination = {
              companyId: destinationCompanyId,
              jobSourceId: created.id,
            };
          } else {
            destination = {
              companyId: destinationCompanyId,
              jobSourceId: "(dry-run: nova fonte seria criada aqui)",
            };
          }
          summary.jobSourcesCreated += 1;
        }
      } else if (willCreateDraftInDryRun) {
        // Dry-run: nem a empresa nem a fonte existem de verdade ainda pra
        // consultar — so contabiliza o que aconteceria.
        summary.jobSourcesCreated += 1;
        destination = {
          companyId: "(dry-run: rascunho de empresa seria criado aqui)",
          jobSourceId: "(dry-run: nova fonte seria criada aqui)",
        };
      }

      if (destination) {
        // Vaga reatribuida a um rascunho (tier != confirmed) fica
        // "inactive" — preservada (nao "removed"), mas fora do radar
        // publico ate voce revisar e ativar a empresa.
        const isDraftDestination = audit.tier !== "confirmed";
        if (!dryRun) {
          const result = await this.database.job.updateMany({
            where: { jobSourceId: audit.jobSourceId },
            data: {
              companyId: destination.companyId,
              jobSourceId: destination.jobSourceId,
              ...(isDraftDestination ? { status: "inactive" } : {}),
            },
          });
          summary.jobsReassigned += result.count;
        } else {
          summary.jobsReassigned += await this.database.job.count({
            where: { jobSourceId: audit.jobSourceId },
          });
        }
      } else {
        // Nenhum destino resolvido: ou match ambiguo entre varias empresas
        // nossas (isAmbiguousMultiOwner — sem como escolher sozinho qual
        // delas e a dona real), ou board claramente estrangeiro
        // (isForeignBoard — todas as vagas ja importadas tem localizacao
        // fora do Brasil, ex: "Webster, MA"; nao vale criar rascunho de
        // empresa pra isso). Em ambos os casos so desativa a fonte errada e
        // marca as vagas ja importadas como removed.
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

  // Rascunhos: Company criada por applyApproved() quando o dono real de um
  // achado nao existia no nosso banco (ver comentario da classe). Sao
  // sempre isActive=false — hoje esse e o UNICO lugar do sistema que cria
  // Company com isActive=false, entao esse campo funciona como o marcador
  // de "e um rascunho pendente de revisao" sem precisar de coluna nova.
  async listDrafts() {
    const companies = await this.database.company.findMany({
      where: { isActive: false },
      orderBy: { createdAt: "desc" },
    });
    if (companies.length === 0) return [];

    const companyIds = companies.map((c) => c.id);
    const [sources, jobCounts] = await Promise.all([
      this.database.jobSource.findMany({
        where: { companyId: { in: companyIds } },
      }),
      this.database.job.groupBy({
        by: ["companyId", "status"],
        where: { companyId: { in: companyIds } },
        _count: { _all: true },
      }),
    ]);

    const sourcesByCompany = new Map<string, typeof sources>();
    for (const source of sources) {
      const list = sourcesByCompany.get(source.companyId) ?? [];
      list.push(source);
      sourcesByCompany.set(source.companyId, list);
    }

    const jobCountsByCompany = new Map<
      string,
      { active: number; inactive: number; removed: number }
    >();
    for (const row of jobCounts) {
      const counts = jobCountsByCompany.get(row.companyId) ?? {
        active: 0,
        inactive: 0,
        removed: 0,
      };
      counts[row.status as "active" | "inactive" | "removed"] = row._count._all;
      jobCountsByCompany.set(row.companyId, counts);
    }

    return companies.map((company) => ({
      ...company,
      sources: sourcesByCompany.get(company.id) ?? [],
      jobCounts: jobCountsByCompany.get(company.id) ?? {
        active: 0,
        inactive: 0,
        removed: 0,
      },
    }));
  }

  private async getDraft(companyId: string) {
    const company = await this.database.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException("company not found");
    if (company.isActive) {
      throw new BadRequestException("company is not a draft (isActive=true)");
    }
    return company;
  }

  async renameDraft(companyId: string, name: string) {
    await this.getDraft(companyId);
    return this.database.company.update({
      where: { id: companyId },
      data: { name, normalizedName: normalizeCompanyName(name) },
    });
  }

  // Publica o rascunho: ativa a Company (passa a aparecer em listagens e
  // participar de lote de crawling), reativa a(s) fonte(s) criada(s) junto
  // com ela, e devolve as vagas que estavam "inactive" (reatribuidas por
  // applyApproved) pra "active" — voltam a aparecer no radar publico.
  async activateDraft(companyId: string) {
    await this.getDraft(companyId);
    await this.database.company.update({
      where: { id: companyId },
      data: { isActive: true },
    });
    await this.database.jobSource.updateMany({
      where: { companyId },
      data: { isActive: true, pauseReason: null },
    });
    await this.database.job.updateMany({
      where: { companyId, status: "inactive" },
      data: { status: "active" },
    });
    return { ok: true } as const;
  }

  // Descarta o rascunho: marca as vagas como removed (mesmo destino final
  // de um achado sem dono conhecido, se voce tivesse rejeitado desde o
  // inicio) e desativa a(s) fonte(s). A Company em si NAO e apagada — fica
  // isActive=false pra sempre como registro de que foi revisada e
  // descartada; continua aparecendo em listDrafts() (com jobCounts.inactive
  // zerado, dando pra distinguir de um rascunho ainda pendente).
  async discardDraft(companyId: string) {
    await this.getDraft(companyId);
    await this.database.jobSource.updateMany({
      where: { companyId },
      data: { isActive: false },
    });
    await this.database.job.updateMany({
      where: { companyId, status: { not: "removed" } },
      data: { status: "removed" },
    });
    return { ok: true } as const;
  }

  private async markApplied(id: string, dryRun: boolean) {
    if (dryRun) return;
    await this.database.jobSourceAudit.update({
      where: { id },
      data: { status: "applied", appliedAt: new Date() },
    });
  }
}
