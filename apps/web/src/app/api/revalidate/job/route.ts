import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import {
  JOB_REVALIDATE_REASONS,
  JOB_SLUG_PATTERN,
  type JobRevalidateReason,
  jobCacheTag,
} from "@/lib/radar-cache";

// Webhook chamado pela API (ingestão/enriquecimento) quando uma vaga muda.
// Protegido por segredo compartilhado; sem RADAR_REVALIDATE_SECRET configurado
// fica desligado (503) e o TTL de 300s do ISR continua valendo sozinho.
//
// Estratégia de expiração (Next 16.2.1, revalidateTag exige o 2º argumento):
// - "updated": edição comum -> "max" (stale-while-revalidate): o visitante
//   seguinte recebe a versão antiga uma vez e a nova é gerada em segundo
//   plano. Defasagem curta é aceitável.
// - "published"/"inactivated": { expire: 0 } (expiração imediata; padrão
//   documentado para webhooks): a próxima requisição bloqueia e regenera —
//   vaga inativa vira 404 na hora e vaga recém-publicada sai do 404 em cache.
// "max" NÃO remove a página imediatamente e por isso não serve à inativação.
const STRATEGY: Record<
  JobRevalidateReason,
  Parameters<typeof revalidateTag>[1]
> = {
  inactivated: { expire: 0 },
  published: { expire: 0 },
  updated: "max",
};

function secretMatches(provided: string | null, expected: string) {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.RADAR_REVALIDATE_SECRET;

  if (!expected) {
    return Response.json({ error: "disabled" }, { status: 503 });
  }

  if (!secretMatches(request.headers.get("x-revalidate-secret"), expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { slug, reason } = (body ?? {}) as {
    reason?: unknown;
    slug?: unknown;
  };

  if (typeof slug !== "string" || !JOB_SLUG_PATTERN.test(slug)) {
    return Response.json({ error: "invalid_slug" }, { status: 400 });
  }

  if (
    typeof reason !== "string" ||
    !(JOB_REVALIDATE_REASONS as readonly string[]).includes(reason)
  ) {
    return Response.json({ error: "invalid_reason" }, { status: 400 });
  }

  const typedReason = reason as JobRevalidateReason;
  revalidateTag(jobCacheTag(slug), STRATEGY[typedReason]);

  return Response.json({ reason: typedReason, revalidated: true, slug });
}
