import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import {
  MAX_DIGEST_SEND_ATTEMPTS,
  OUTCOME_UNKNOWN_RECONCILIATION_WINDOW_MS,
} from "./monitor-digest.constants";

const LOCK_ID = "monitor-digest-outcome-reconciler";
const LOCK_TTL_MS = 5 * 60_000;

// Resolve MonitorDigest presos em OUTCOME_UNKNOWN (timeout/erro de rede
// ambíguo no envio) que NENHUM evento do provider confirmou dentro da
// janela de reconciliação. Resolução por EVENTO (o caminho mais comum e
// mais seguro) acontece em monitor-digest-webhook.service.ts, assim que um
// Send/Delivery/Bounce/Complaint/Reject chega correlacionado por tag
// digestId ou providerMessageId — este reconciler só cuida do que sobra: a
// ausência total de evento depois do prazo.
//
// Trade-off assumido e documentado (não eliminável sem um recurso de
// idempotência nativo do SES equivalente ao Idempotency-Key do Resend):
// requeue depois da janela carrega um risco residual pequeno de duplicar o
// envio, se o SES processou a mensagem mas o evento atrasou além dos 10
// minutos. Mitigação: o requeue consome o MESMO orçamento de tentativas
// (MAX_DIGEST_SEND_ATTEMPTS) que qualquer FAILED confirmado — nunca mais
// retries no total do que um envio que falhou de forma confirmada teria.
// Esgotado o orçamento, o digest fica em OUTCOME_UNKNOWN definitivamente,
// visível em /admin/alerta-vagas, resolvido só por reenvio manual
// (POST /admin/monitor/digests/:id/resend).
@Injectable()
export class MonitorDigestOutcomeReconciler {
  private readonly logger = new Logger(MonitorDigestOutcomeReconciler.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
  ) {}

  @Cron("0 */5 * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    await this.reconcile();
  }

  async reconcile(): Promise<{ requeued: number; exhausted: number }> {
    const owner = `monitor-digest-outcome-reconciler-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return { requeued: 0, exhausted: 0 };
    }

    try {
      const threshold = new Date(
        Date.now() - OUTCOME_UNKNOWN_RECONCILIATION_WINDOW_MS,
      );
      const stuck = await this.database.monitorDigest.findMany({
        where: {
          status: "OUTCOME_UNKNOWN",
          outcomeUnknownAt: { lt: threshold },
        },
      });

      let requeued = 0;
      let exhausted = 0;

      for (const digest of stuck) {
        const attempts = digest.attempts + 1;

        if (attempts >= MAX_DIGEST_SEND_ATTEMPTS) {
          exhausted += 1;
          this.logger.warn(
            `monitor digest ${digest.id} exhausted retry budget while OUTCOME_UNKNOWN (attempt ${attempts}) — staying OUTCOME_UNKNOWN, needs manual resend`,
          );
          await this.database.monitorDigest.update({
            where: { id: digest.id },
            data: {
              attempts,
              lastError:
                "outcome unknown: janela de reconciliação esgotada sem evento confirmatório e sem orçamento de retry restante — requer reenvio manual",
            },
          });
          continue;
        }

        requeued += 1;
        this.logger.log(
          `monitor digest ${digest.id} requeued after OUTCOME_UNKNOWN window with no confirming event (attempt ${attempts})`,
        );
        await this.database.monitorDigest.update({
          where: { id: digest.id },
          data: {
            status: "PENDING",
            attempts,
            outcomeUnknownAt: null,
            lastError:
              "outcome unknown: janela de reconciliação esgotada sem evento confirmatório — reenfileirado (retry controlado)",
          },
        });
      }

      return { requeued, exhausted };
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }
}
