import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { JobSourceType } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { CompanyLogoFetchService } from "./company-logo/company-logo-fetch.service";
import { DiscoveredCompaniesService } from "./discovered-companies.service";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionService } from "./ingestion.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";

const MANUAL_RUNNER_LOCK_ID = "manual-ingestion-batch-runner";
// Renovado periodicamente (ver heartbeat em drainActiveRuns) em vez de
// reservado uma vez so pra duracao inteira do batch — um TTL curto aqui
// significa que, se o processo morrer no meio (deploy, restart, crash),
// o lock expira rapido e o proximo tick de outra instancia retoma o
// batch (ou finaliza um cancelamento pendente) em minutos, nao em ate
// uma hora.
const MANUAL_RUNNER_LOCK_TTL_MS = 5 * 60_000;
const ITEM_LOCK_TTL_MS = 10 * 60_000;
// Um item que ficou "running" por mais que isso sem terminar quase certo
// morreu junto com o processo que o marcou assim — nada mais vai
// avança-lo (o where clause so promove "queued" -> "running", nunca
// retoma um "running" preso). Volta pra "queued" pra ser reprocessado.
const STALE_ITEM_THRESHOLD_MS = ITEM_LOCK_TTL_MS;
// Jitter window around normalDelayMs/errorDelayMs so requests to the same
// source don't land at a fixed cadence — a predictable interval is itself
// a signal anti-bot heuristics key off of.
const JITTER_MIN_FACTOR = 0.7;
const JITTER_MAX_FACTOR = 1.3;
// A Gupy hospeda todas as empresas no mesmo dominio (*.gupy.io), entao 2
// lotes concorrentes ainda batem no mesmo host — por isso o concurrency
// fica baixo e a segunda vaga so entra depois de um delay com jitter (ver
// a reserva otimista em drainActiveRuns), nunca junto com a primeira.
// Outros adapters (Greenhouse, Lever etc.) sao hosts diferentes por
// empresa, mas ficam em 1 mesmo assim ate termos dado confirmando que
// aguentam mais.
const GUPY_ADAPTER_TYPE = "gupy";
const GUPY_STAGGERED_CONCURRENCY = 2;
// Teto de quanto o loop principal dorme de uma vez quando nao ha nada
// lancavel (tudo em cooldown) — mantem o loop responsivo a cancelamento e
// a novos batch runs sem virar busy-loop.
const IDLE_POLL_INTERVAL_MS = 5_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Um item pode travar de verdade (fetch sem timeout em algum ponto do
// adapter, chamada de LLM sem AbortSignal, etc.) e nunca resolver — se o
// loop principal esperasse Promise.race(inFlight) puro nesse caso, ele
// ficaria preso pra sempre, mesmo que OUTROS runs (sem nada em voo)
// tivessem itens elegiveis prontos pra rodar. O cap aqui garante que o
// loop sempre acorda e reavalia tudo, mesmo com uma promise realmente
// travada no meio.
function raceWithIdleCap(inFlight: Set<Promise<unknown>>) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, IDLE_POLL_INTERVAL_MS);
    // unref pra esse timer nao segurar o processo vivo (nem atrasar o
    // encerramento dos testes) so por estar pendente — ele e so um teto,
    // nao trabalho real.
    timer.unref?.();
    Promise.race(inFlight).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function jitteredDelay(baseMs: number) {
  const factor =
    JITTER_MIN_FACTOR + Math.random() * (JITTER_MAX_FACTOR - JITTER_MIN_FACTOR);
  return Math.round(baseMs * factor);
}

function clampRunAggregate(
  totalSources: number,
  succeededCount: number,
  failedCount: number,
  skippedCount: number,
) {
  let succeeded = Math.max(0, succeededCount);
  let failed = Math.max(0, failedCount);
  let skipped = Math.max(0, skippedCount);
  let overflow = succeeded + failed + skipped - Math.max(0, totalSources);

  if (overflow > 0) {
    const skippedDecrement = Math.min(skipped, overflow);
    skipped -= skippedDecrement;
    overflow -= skippedDecrement;
  }
  if (overflow > 0) {
    const failedDecrement = Math.min(failed, overflow);
    failed -= failedDecrement;
    overflow -= failedDecrement;
  }
  if (overflow > 0) {
    const succeededDecrement = Math.min(succeeded, overflow);
    succeeded -= succeededDecrement;
  }

  return {
    failedCount: failed,
    skippedCount: skipped,
    succeededCount: succeeded,
  };
}

function isMissingManualBatchTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const prismaError = error as Error & {
    code?: string;
    meta?: { modelName?: string; table?: string };
  };

  return (
    prismaError.code === "P2021" &&
    (prismaError.meta?.modelName === "IngestionBatchRun" ||
      prismaError.meta?.modelName === "IngestionBatchItem")
  );
}

type ActiveBatchRun = {
  id: string;
  runKind: "CRAWL" | "LOGO_FETCH" | "DISCOVERY_VALIDATE";
  scopeType: string;
  scopeValue: string;
  status:
    | "queued"
    | "running"
    | "cancelling"
    | "completed"
    | "failed"
    | "cancelled";
  cancelRequestedAt: Date | null;
  createdAt: Date;
};

type ClaimedItemOutcome = {
  outcome: "processed" | "skipped";
  blocked: boolean;
};

@Injectable()
export class IngestionManualRunnerService {
  private readonly logger = new Logger(IngestionManualRunnerService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(CompanyLogoFetchService)
    private readonly companyLogoFetchService: CompanyLogoFetchService,
    @Inject(DiscoveredCompaniesService)
    private readonly discoveredCompaniesService: DiscoveredCompaniesService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(GlobalSchedulerConfigService)
    private readonly globalConfigService: GlobalSchedulerConfigService,
  ) {}

  @Cron("*/10 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    try {
      await this.processNextBatchRun();
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        this.logger.warn(
          "manual ingestion runner disabled: missing manual ingestion tables (run database migrations)",
        );
        return;
      }
      throw error;
    }
  }

  async processNextBatchRun() {
    const owner = `manual-runner-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      MANUAL_RUNNER_LOCK_ID,
      owner,
      MANUAL_RUNNER_LOCK_TTL_MS,
    );

    if (!acquired) {
      return;
    }

    // Um unico heartbeat cobre a invocacao inteira (em vez de um por item)
    // — o TTL do lock externo (5min) so importa continuar renovado
    // enquanto o loop estiver vivo, nao importa qual run/item especifico
    // esta em andamento no momento.
    const heartbeat = setInterval(
      () => {
        void this.lockRepository.acquire(
          MANUAL_RUNNER_LOCK_ID,
          owner,
          MANUAL_RUNNER_LOCK_TTL_MS,
        );
      },
      Math.floor(MANUAL_RUNNER_LOCK_TTL_MS / 2),
    );

    try {
      await this.drainActiveRuns(owner);
    } finally {
      clearInterval(heartbeat);
      await this.lockRepository.release(MANUAL_RUNNER_LOCK_ID, owner);
    }
  }

  // Substitui o antigo "pega o run mais velho e processa todos os itens
  // dele antes de olhar pra qualquer outro" — esse desenho fazia um batch
  // grande (ex: 795 empresas Gupy) monopolizar o unico worker por horas,
  // deixando batch runs de outros adapters parados na fila ate expirar
  // por staleness (ver ingestion-job.service.ts) em vez de rodar.
  //
  // Agora todos os batch runs ativos avancam juntos, item por item,
  // priorizando sempre o run que esta esperando a mais tempo (fairness).
  // O pacing entre itens de um MESMO run continua existindo (nextEligibleAt
  // + jitteredDelay), so que sem bloquear o loop inteiro — enquanto um run
  // esta "esperando" seu delay, outros runs elegiveis usam esse tempo.
  private async drainActiveRuns(owner: string) {
    // Lida uma vez no inicio da execucao (nao a cada passada) — uma
    // mudanca salva via /admin/ingestion (delay entre empresas) so entra
    // em vigor na proxima vez que o loop for chamado do zero, nao no meio
    // de um run ja em andamento.
    const delayConfig = await this.globalConfigService.getConfig();
    // Um slot por vaga de concorrencia do run (Gupy = 2, todo o resto = 1)
    // — nextEligibleAt e por SLOT, nao por run inteiro, senao a 2a vaga da
    // Gupy nunca abre antes da 1a ja ter terminado (crawl rapido, delay
    // configurado bem mais longo que a duracao real de um crawl), o que
    // anula o concurrency=2 na pratica.
    const nextEligibleAt = new Map<string, number[]>();
    const inFlight = new Set<Promise<unknown>>();

    const getSlots = (runId: string, concurrency: number): number[] => {
      let slots = nextEligibleAt.get(runId);
      if (!slots) {
        slots = new Array(concurrency).fill(0);
        nextEligibleAt.set(runId, slots);
      } else if (slots.length < concurrency) {
        slots = [...slots, ...new Array(concurrency - slots.length).fill(0)];
        nextEligibleAt.set(runId, slots);
      }
      return slots;
    };
    const earliestEligibleAt = (runId: string): number => {
      const slots = nextEligibleAt.get(runId);
      return slots && slots.length > 0 ? Math.min(...slots) : 0;
    };

    for (;;) {
      const activeRuns = (await this.database.ingestionBatchRun.findMany({
        where: { status: { in: ["queued", "running", "cancelling"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })) as ActiveBatchRun[];

      if (activeRuns.length === 0) {
        if (inFlight.size > 0) {
          await raceWithIdleCap(inFlight);
          continue;
        }
        return;
      }

      for (const run of activeRuns) {
        if (run.status === "queued") {
          await this.database.ingestionBatchRun.update({
            where: { id: run.id },
            data: { startedAt: new Date(), status: "running" },
          });
        }
      }

      const runsToCancel = activeRuns.filter(
        (run) => run.cancelRequestedAt || run.status === "cancelling",
      );
      const cancelledIds = new Set<string>();
      for (const run of runsToCancel) {
        const stillRunning = await this.database.ingestionBatchItem.count({
          where: { batchRunId: run.id, status: "running" },
        });
        // Espera os lançamentos concorrentes desse run em andamento
        // terminarem antes de finalizar — cancelar por baixo enquanto uma
        // chamada real ao adapter ainda esta em voo deixaria a contagem
        // inconsistente com o trabalho de fato feito.
        if (stillRunning > 0) continue;

        await this.finalizeCancelledRun(run.id);
        nextEligibleAt.delete(run.id);
        cancelledIds.add(run.id);
      }

      const candidates = activeRuns.filter(
        (run) => !cancelledIds.has(run.id) && !runsToCancel.includes(run),
      );

      for (const run of candidates) {
        await this.recoverStaleItems(run.id);
      }

      const now = Date.now();
      const launchable: ActiveBatchRun[] = [];
      const drained: ActiveBatchRun[] = [];

      for (const run of candidates) {
        const eligibleAt = earliestEligibleAt(run.id);
        if (eligibleAt > now) continue;

        const runningCount = await this.database.ingestionBatchItem.count({
          where: { batchRunId: run.id, status: "running" },
        });
        if (runningCount >= this.concurrencyFor(run)) continue;

        const hasQueued = await this.database.ingestionBatchItem.count({
          where: { batchRunId: run.id, status: "queued" },
        });
        if (hasQueued === 0) {
          if (runningCount === 0) drained.push(run);
          continue;
        }

        launchable.push(run);
      }

      for (const run of drained) {
        await this.finalizeRun(run.id, false);
        nextEligibleAt.delete(run.id);
      }

      if (launchable.length === 0) {
        if (drained.length > 0) continue;
        if (inFlight.size > 0) {
          await raceWithIdleCap(inFlight);
          continue;
        }
        const pending = candidates
          .map((run) => earliestEligibleAt(run.id))
          .filter((eligibleAt) => eligibleAt > now);
        if (pending.length === 0) return;
        const waitMs = Math.min(
          Math.max(0, Math.min(...pending) - now),
          IDLE_POLL_INTERVAL_MS,
        );
        await sleep(waitMs);
        continue;
      }

      // Prioriza o run que esta esperando a mais tempo (nunca lancado ainda
      // entra primeiro, por createdAt) — isso e o que evita a fome que
      // deixava outros adapters parados atras de um batch grande.
      launchable.sort((a, b) => {
        const aEligible = earliestEligibleAt(a.id) || -1;
        const bEligible = earliestEligibleAt(b.id) || -1;
        if (aEligible !== bEligible) return aEligible - bEligible;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const run = launchable[0];

      // activeRuns e um retrato do topo da passada — varios awaits ja
      // rolaram desde entao (recoverStaleItems, as contagens acima), tempo
      // de sobra pra um cancelamento chegar no meio. Reconfere fresco antes
      // de reivindicar mais um item, senao um cancelamento no meio da
      // passada deixa passar mais um lancamento (bug visto no teste de
      // cancelamento).
      const freshRun = await this.database.ingestionBatchRun.findUnique({
        where: { id: run.id },
      });
      if (
        !freshRun ||
        freshRun.cancelRequestedAt ||
        freshRun.status === "cancelling"
      ) {
        continue;
      }

      const item = await this.database.ingestionBatchItem.findFirst({
        where: { batchRunId: run.id, status: "queued" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (!item) continue;

      const claimResult = await this.database.ingestionBatchItem.updateMany({
        where: { id: item.id, status: { in: ["queued"] } },
        data: { startedAt: new Date(), status: "running" },
      });
      if (claimResult.count === 0) continue;

      const launchedAt = Date.now();
      // Reserva otimista do slot usado JA no lancamento (nao so quando o
      // item termina) — e o que garante o stagger entre lancamentos que
      // disputam o MESMO slot: sem isso, o proximo lancamento nesse slot
      // poderia sair na proxima volta do loop sem nenhum espacamento. Cada
      // slot pacinga independente, entao com concurrency=2 a 2a vaga usa o
      // outro slot (que comeca livre) e roda de verdade em paralelo com a
      // 1a, em vez de esperar ela terminar. O valor real (normal x error
      // delay) sobrescreve essa reserva assim que o item termina, mais
      // abaixo.
      const slots = getSlots(run.id, this.concurrencyFor(run));
      const slotIndex = slots.indexOf(Math.min(...slots));
      slots[slotIndex] = launchedAt + jitteredDelay(delayConfig.normalDelayMs);

      let itemPromise!: Promise<unknown>;
      itemPromise = this.runClaimedItem(
        run.id,
        run.runKind,
        item,
        owner,
        // O calculo do delay real (normal x error) precisa acontecer
        // DENTRO de runClaimedItem, de forma sincrona, antes da escrita no
        // banco que tira o item de "running" — se isso rodasse aqui fora
        // via .then() (depois do await inteiro de runClaimedItem), o loop
        // principal podia ver o item como "nao mais running" e liberar o
        // proximo lancamento antes do nextEligibleAt real ser gravado
        // (janela de corrida real, pegou o teste de errorDelayMs).
        (blocked) => {
          const baseDelayMs = blocked
            ? delayConfig.errorDelayMs
            : delayConfig.normalDelayMs;
          slots[slotIndex] = launchedAt + jitteredDelay(baseDelayMs);
        },
      )
        .catch((error) => {
          this.logger.warn(
            `unexpected error processing item ${item.id}: ${error instanceof Error ? error.message : "unknown"}`,
          );
          slots[slotIndex] =
            launchedAt + jitteredDelay(delayConfig.normalDelayMs);
        })
        .finally(() => {
          inFlight.delete(itemPromise);
        });
      inFlight.add(itemPromise);
    }
  }

  private concurrencyFor(run: ActiveBatchRun) {
    if (run.scopeType === "adapter" && run.scopeValue === GUPY_ADAPTER_TYPE) {
      return GUPY_STAGGERED_CONCURRENCY;
    }
    return 1;
  }

  private async recoverStaleItems(batchRunId: string) {
    const staleThreshold = new Date(Date.now() - STALE_ITEM_THRESHOLD_MS);
    const staleItems = await this.database.ingestionBatchItem.findMany({
      where: {
        batchRunId,
        status: "running",
        startedAt: { lt: staleThreshold },
      },
    });

    for (const item of staleItems) {
      this.logger.warn(
        `ingestion batch item ${item.id} recovered from stale running (processo provavelmente morreu no meio)`,
      );
      await this.database.ingestionBatchItem.update({
        where: { id: item.id },
        data: { status: "queued" },
      });
    }
  }

  // Item ja foi reivindicado (status "running" em transacao unica no
  // chamador) antes desse metodo ser invocado — o que roda aqui pode ser
  // lancado em paralelo com outro item do mesmo run (Gupy) sem risco de
  // dois lançamentos pegarem o mesmo item.
  private async runClaimedItem(
    batchRunId: string,
    runKind: "CRAWL" | "LOGO_FETCH" | "DISCOVERY_VALIDATE",
    item: {
      id: string;
      jobSourceId: string | null;
      companyId: string | null;
      sourceType: JobSourceType | null;
      discoveredCompanyId: string | null;
    },
    owner: string,
    onOutcomeKnown: (blocked: boolean) => void,
  ): Promise<ClaimedItemOutcome> {
    const itemOwner = `${owner}:${item.id}`;
    // DISCOVERY_VALIDATE nao compete por um recurso externo compartilhado
    // (cada candidato so e processado por 1 item, nunca por 2 fontes) — a
    // chave de lock so existe pra manter o mesmo formato de acquire/release
    // do bloco CRAWL/LOGO_FETCH abaixo.
    const itemLockId =
      runKind === "DISCOVERY_VALIDATE"
        ? `discovery-candidate:${item.discoveredCompanyId}`
        : `job-source:${item.jobSourceId}`;
    const sourceLockAcquired = await this.lockRepository.acquire(
      itemLockId,
      itemOwner,
      ITEM_LOCK_TTL_MS,
    );

    if (!sourceLockAcquired) {
      const markSkippedResult =
        await this.database.ingestionBatchItem.updateMany({
          where: { id: item.id, status: { in: ["running"] } },
          data: { finishedAt: new Date(), status: "skipped" },
        });
      if (markSkippedResult.count > 0) {
        await this.database.ingestionBatchRun.update({
          where: { id: batchRunId },
          data: { skippedCount: { increment: 1 } },
        });
      }
      return { blocked: false, outcome: "skipped" };
    }

    let blocked = false;

    try {
      if (runKind === "DISCOVERY_VALIDATE") {
        // validateOne sempre resolve com um status de negocio (VALIDATED,
        // NO_TECH_JOBS, NO_ACTIVE_JOBS, INVALID) ou lanca (candidato ja
        // IMPORTADO, ou probe inconclusivo) — o catch generico la embaixo
        // ja cobre o caso de excecao, entao aqui so trata o caminho feliz.
        const candidate = await this.discoveredCompaniesService.validateOne(
          item.discoveredCompanyId as string,
        );
        onOutcomeKnown(false);
        const outcomeSummary = candidate.careersUrl
          ? `${candidate.status} · ${candidate.careersUrl}`
          : candidate.status;
        const markCompletedResult =
          await this.database.ingestionBatchItem.updateMany({
            where: { id: item.id, status: { in: ["queued", "running"] } },
            data: {
              errorMessage: outcomeSummary,
              finishedAt: new Date(),
              sourceName: candidate.careersUrl,
              sourceType: candidate.adapterType,
              status: "completed",
            },
          });
        if (markCompletedResult.count > 0) {
          await this.database.ingestionBatchRun.update({
            where: { id: batchRunId },
            data: { succeededCount: { increment: 1 } },
          });
        }
        return { blocked: false, outcome: "processed" };
      }

      if (runKind === "LOGO_FETCH") {
        const logoResult =
          await this.companyLogoFetchService.fetchLogoForCompany(
            item.companyId as string,
            item.sourceType as JobSourceType,
          );

        // "skipped" (empresa sem fonte suportada / adapter ainda sem
        // extractor) nao e uma falha do processamento — conta como
        // sucesso do item pra nao poluir o batch com "falhas" que sao na
        // verdade "nada a fazer aqui".
        onOutcomeKnown(false);
        if (logoResult.status === "failed") {
          const markFailedResult =
            await this.database.ingestionBatchItem.updateMany({
              where: { id: item.id, status: { in: ["queued", "running"] } },
              data: {
                errorMessage: logoResult.errorSummary,
                finishedAt: new Date(),
                status: "failed",
              },
            });
          if (markFailedResult.count > 0) {
            await this.database.ingestionBatchRun.update({
              where: { id: batchRunId },
              data: { failedCount: { increment: 1 } },
            });
          }
        } else {
          const markCompletedResult =
            await this.database.ingestionBatchItem.updateMany({
              where: { id: item.id, status: { in: ["queued", "running"] } },
              data: {
                errorMessage:
                  logoResult.status === "skipped" ? logoResult.reason : null,
                finishedAt: new Date(),
                status: "completed",
              },
            });
          if (markCompletedResult.count > 0) {
            await this.database.ingestionBatchRun.update({
              where: { id: batchRunId },
              data: { succeededCount: { increment: 1 } },
            });
          }
        }

        return { blocked: false, outcome: "processed" };
      }

      const result = await this.ingestionService.runJobSource(
        item.jobSourceId as string,
      );

      // runJobSource resolves even when individual job observations
      // failed inside an otherwise-successful adapter run (status
      // "failed" with previewItems/errorSummary describing why) — it
      // only throws for source-level failures (network, 403, etc).
      // Both cases must count as a failed batch item, or partial
      // failures silently show up as "completed" in the batch log.
      if (result.status === "failed") {
        // Escalar pra errorDelayMs so faz sentido quando o erro cheira a
        // anti-bot (403 confirmado, ver evaluate403CircuitBreaker) — a
        // maioria das falhas reais (URL de board desatualizada, HTML
        // mudou) e um problema estrutural da fonte que nao melhora
        // esperando mais, so desperdica tempo do batch inteiro.
        blocked = Boolean(
          result.currentConsecutive403 && result.currentConsecutive403 > 0,
        );
        // Sincrono, antes do updateMany que tira o item de "running" —
        // ver comentario no chamador sobre a janela de corrida que isso
        // fecha.
        onOutcomeKnown(blocked);
        const markFailedResult =
          await this.database.ingestionBatchItem.updateMany({
            where: { id: item.id, status: { in: ["queued", "running"] } },
            data: {
              errorMessage:
                result.errorSummary ?? "ingestion completed with failures",
              finishedAt: new Date(),
              ingestionRunId: result.id,
              status: "failed",
            },
          });
        if (markFailedResult.count > 0) {
          await this.database.ingestionBatchRun.update({
            where: { id: batchRunId },
            data: { failedCount: { increment: 1 } },
          });
        }
      } else {
        onOutcomeKnown(false);
        const markCompletedResult =
          await this.database.ingestionBatchItem.updateMany({
            where: { id: item.id, status: { in: ["queued", "running"] } },
            data: {
              errorMessage: null,
              finishedAt: new Date(),
              ingestionRunId: result.id,
              status: "completed",
            },
          });
        if (markCompletedResult.count > 0) {
          await this.database.ingestionBatchRun.update({
            where: { id: batchRunId },
            data: { succeededCount: { increment: 1 } },
          });
        }
      }
    } catch (error) {
      // Excecoes aqui vem de fora do adapter (ex: ConflictException por
      // corrida de "run ja em andamento") — nao e sinal de anti-bot, entao
      // nao escalamos o delay.
      blocked = false;
      onOutcomeKnown(false);
      const markFailedResult =
        await this.database.ingestionBatchItem.updateMany({
          where: { id: item.id, status: { in: ["queued", "running"] } },
          data: {
            errorMessage:
              error instanceof Error ? error.message : "ingestion failed",
            finishedAt: new Date(),
            status: "failed",
          },
        });
      if (markFailedResult.count > 0) {
        await this.database.ingestionBatchRun.update({
          where: { id: batchRunId },
          data: { failedCount: { increment: 1 } },
        });
      }
      this.logger.warn(
        `manual ingestion item failed ${item.id}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      await this.lockRepository.release(itemLockId, itemOwner);
    }

    return { blocked, outcome: "processed" };
  }

  private async finalizeCancelledRun(runId: string) {
    await this.cancelRemainingItems(runId);
    await this.finalizeRun(runId, true);
  }

  private async finalizeRun(runId: string, cancelled: boolean) {
    const run = await this.database.ingestionBatchRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      return;
    }

    const counters = await this.recomputeRunCounters(runId, run.totalSources);
    const status = cancelled
      ? "cancelled"
      : counters.failedCount > 0
        ? "failed"
        : "completed";
    await this.database.ingestionBatchRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        ...counters,
        status,
      },
    });
  }

  private async recomputeRunCounters(batchRunId: string, totalSources: number) {
    const items = await this.database.ingestionBatchItem.findMany({
      where: { batchRunId },
    });

    let succeededCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    for (const item of items) {
      if (item.status === "completed") {
        succeededCount += 1;
      } else if (item.status === "failed") {
        failedCount += 1;
      } else if (item.status === "skipped" || item.status === "cancelled") {
        skippedCount += 1;
      }
    }

    return clampRunAggregate(
      totalSources,
      succeededCount,
      failedCount,
      skippedCount,
    );
  }

  private async cancelRemainingItems(batchRunId: string) {
    const result = await this.database.ingestionBatchItem.updateMany({
      where: {
        batchRunId,
        status: { in: ["queued", "running"] },
      },
      data: {
        errorMessage: "cancelled",
        finishedAt: new Date(),
        status: "cancelled",
      },
    });

    return result.count;
  }
}
