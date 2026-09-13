import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBusinessFunnelEventVersion } from "../analysis-observability/analysis-event-version.registry";
import { POSTHOG_EVENT_NAME } from "./monitor-digest-webhook.service";

// Regressão do incidente em produção: monitor_digest_provider_accepted/
// rejected (os dois eventos novos do fluxo SES, emitidos só quando o
// eventType do webhook é SENT/REJECTED — Resend nunca emite esses dois
// porque sua resposta HTTP síncrona já confirma o envio) não tinham
// entrada no registry versionado, e BusinessFunnelEventService.record
// rejeitava com "business funnel event is missing from event version
// registry". O erro era só logado (nunca impedia a gravação do
// MonitorDigestEvent, que acontece antes — ver
// monitor-digest-webhook.service.ts), mas ainda assim o evento nunca
// chegava ao PostHog, silenciosamente.
//
// Itera POSTHOG_EVENT_NAME inteiro (a mesma fonte de verdade que o
// service usa pra decidir o nome do evento) contra o registry REAL, não
// uma lista duplicada — um evento novo adicionado ali sem entrada no
// registry falha este teste, não só em produção.
test("every event name in MonitorDigestWebhookService.POSTHOG_EVENT_NAME has a version registered", () => {
  for (const [eventType, eventName] of Object.entries(POSTHOG_EVENT_NAME)) {
    const version = resolveBusinessFunnelEventVersion(eventName);
    assert.notEqual(
      version,
      null,
      `evento "${eventName}" (MonitorDigestEventType.${eventType}) não está cadastrado em BUSINESS_FUNNEL_EVENT_VERSION_MAP`,
    );
  }
});

// MonitorDigestWorker emite este evento (fora do webhook, na hora do
// envio bem-sucedido) com o nome literal, sem passar por
// POSTHOG_EVENT_NAME — coberto aqui porque é o único outro evento de
// funil de negócio de todo o fluxo do digest (OUTCOME_UNKNOWN e a
// reconciliação usam só logger.warn/log, nunca o funil — corretamente,
// são bookkeeping operacional de retry, não passos do funil do
// usuário).
test("monitor_digest_sent (emitted by MonitorDigestWorker) has a version registered", () => {
  assert.notEqual(
    resolveBusinessFunnelEventVersion("monitor_digest_sent"),
    null,
  );
});
