import { Injectable, Logger } from "@nestjs/common";

// Avisa o front (Next.js) quando uma vaga muda, para o cache ISR de
// /radar/[slug] ser invalidado sem esperar o TTL de 300s.
//
// CONTRATO: nunca lança, nunca bloqueia e nunca atrasa quem chama. A
// ingestão só enfileira (síncrono); o envio HTTP roda em segundo plano, com
// concorrência, tamanho de fila e timeouts limitados. Falha em qualquer
// ponto (webhook fora, segredo errado, fila cheia) só é logada: o TTL do ISR
// continua sendo o teto de defasagem.
//
// Desligado (no-op) sem WEB_REVALIDATE_URL e WEB_REVALIDATE_SECRET.

export type WebRevalidationReason = "updated" | "published" | "inactivated";

// Se a mesma vaga é pedida mais de uma vez antes do envio, prevalece o motivo
// mais forte: inativar/publicar exigem expiração imediata; "updated" não.
const REASON_PRIORITY: Record<WebRevalidationReason, number> = {
  inactivated: 3,
  published: 2,
  updated: 1,
};

const MAX_QUEUE_SIZE = 2_000;
const MAX_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 1_000;
const LOG_INTERVAL_MS = 30_000;

@Injectable()
export class WebRevalidationService {
  private readonly logger = new Logger(WebRevalidationService.name);
  private readonly url = process.env.WEB_REVALIDATE_URL?.trim();
  private readonly secret = process.env.WEB_REVALIDATE_SECRET?.trim();
  private readonly queue = new Map<string, WebRevalidationReason>();
  private active = 0;
  private idleWaiters: Array<() => void> = [];
  private lastFailureLogAt = 0;
  private suppressedFailures = 0;
  private lastDropLogAt = 0;
  private droppedSinceLog = 0;

  isEnabled(): boolean {
    return Boolean(this.url && this.secret);
  }

  // Síncrono e à prova de falha: pode ser chamado de dentro de laços de
  // ingestão sem try/catch nem await.
  requestJobRevalidation(
    slug: string | null | undefined,
    reason: WebRevalidationReason,
  ): void {
    try {
      if (!this.isEnabled() || !slug) return;

      const existing = this.queue.get(slug);
      if (existing) {
        if (REASON_PRIORITY[reason] > REASON_PRIORITY[existing]) {
          this.queue.set(slug, reason);
        }
        return;
      }

      if (this.queue.size >= MAX_QUEUE_SIZE) {
        this.noteDropped();
        return;
      }

      this.queue.set(slug, reason);
      this.pump();
    } catch (error) {
      this.logger.warn(
        `web revalidation enqueue failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  // Resolve quando fila e envios em andamento terminarem (testes/shutdown).
  idle(): Promise<void> {
    if (this.active === 0 && this.queue.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump() {
    while (this.active < MAX_CONCURRENCY && this.queue.size > 0) {
      const next = this.queue.entries().next().value;
      if (!next) break;
      const [slug, reason] = next;
      this.queue.delete(slug);
      this.active += 1;
      void this.send(slug, reason)
        .catch(() => undefined)
        .finally(() => {
          this.active -= 1;
          this.pump();
          this.notifyIdle();
        });
    }
  }

  private notifyIdle() {
    if (this.active === 0 && this.queue.size === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  private async send(slug: string, reason: WebRevalidationReason) {
    // Inativação/publicação valem um retry; edição comum se resolve pelo TTL.
    const attempts = reason === "updated" ? 1 : 2;
    let lastFailure = "unknown";

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(this.url as string, {
          body: JSON.stringify({ reason, slug }),
          headers: {
            "content-type": "application/json",
            "x-revalidate-secret": this.secret as string,
          },
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.ok) return;
        lastFailure = `HTTP ${response.status}`;
        // 4xx (segredo errado, slug inválido) não melhora tentando de novo.
        if (response.status >= 400 && response.status < 500) break;
      } catch (error) {
        lastFailure = error instanceof Error ? error.name : "error";
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    this.noteFailure(slug, reason, lastFailure);
  }

  // Log limitado: numa queda do front, milhares de falhas viram 1 linha a
  // cada 30s com a contagem suprimida — nunca inunda o log da ingestão.
  private noteFailure(
    slug: string,
    reason: WebRevalidationReason,
    failure: string,
  ) {
    const now = Date.now();
    if (now - this.lastFailureLogAt < LOG_INTERVAL_MS) {
      this.suppressedFailures += 1;
      return;
    }
    this.logger.warn(
      `web revalidation failed (slug=${slug} reason=${reason}): ${failure}; +${this.suppressedFailures} similar suppressed; ISR TTL covers staleness`,
    );
    this.lastFailureLogAt = now;
    this.suppressedFailures = 0;
  }

  private noteDropped() {
    this.droppedSinceLog += 1;
    const now = Date.now();
    if (now - this.lastDropLogAt < LOG_INTERVAL_MS) return;
    this.logger.warn(
      `web revalidation queue full (${MAX_QUEUE_SIZE}); dropped ${this.droppedSinceLog} request(s); ISR TTL covers staleness`,
    );
    this.lastDropLogAt = now;
    this.droppedSinceLog = 0;
  }
}
