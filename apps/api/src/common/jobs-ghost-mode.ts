// Equivalente backend de apps/web/src/lib/jobs-ghost-mode.ts — mesma env
// var (JOBS_GHOST_MODE), lida aqui como fonte de verdade do gate REAL de
// acesso (o backend é o único lugar que efetivamente bloqueia algo; a
// cópia da mesma variável na Vercel só controla visibilidade cosmética de
// menu no frontend, nunca segurança). Não usar em nenhum outro lugar do
// backend além de MonitorEntitlementService — é o único ponto de decisão.
export function isJobsGhostModeEnabled(): boolean {
  return process.env.JOBS_GHOST_MODE === "true";
}
