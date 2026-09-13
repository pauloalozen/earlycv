// Compartilhado entre MonitorDigestWorker e MonitorDigestOutcomeReconciler —
// um único orçamento de tentativas por MonitorDigest, sem distinguir a
// origem (erro confirmado do provider vs. requeue por OUTCOME_UNKNOWN sem
// evento de confirmação dentro da janela). Decisão deliberada: em vez de um
// segundo contador dedicado só para requeues de OUTCOME_UNKNOWN (o que
// exigiria mais uma coluna), o mesmo `attempts` e o mesmo teto limitam as
// duas situações — nunca mais retries no total do que MAX_DIGEST_SEND_ATTEMPTS,
// o que é conservador (nunca menos seguro que ter dois orçamentos
// separados) e evita adicionar schema sem necessidade real.
export const MAX_DIGEST_SEND_ATTEMPTS = 3;

// Tempo que um MonitorDigest fica em OUTCOME_UNKNOWN aguardando um evento do
// provider (SES: Send/Delivery/Bounce/Complaint/Reject; correlacionado por
// tag digestId ou providerMessageId) confirmar o que aconteceu, antes do
// MonitorDigestOutcomeReconciler decidir reenfileirar. A latência normal de
// entrega de evento do SES via SNS é de segundos — 10 minutos dá folga
// generosa sem deixar o digest pendurado por muito tempo.
export const OUTCOME_UNKNOWN_RECONCILIATION_WINDOW_MS = 10 * 60_000;
