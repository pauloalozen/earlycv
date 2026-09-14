import { NextResponse } from "next/server";

const MAX_POSTHOG_SESSION_ID_LENGTH = 256;

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

// Contexto de rede do visitante original, só pra classificação de tráfego
// (bot/crawler/AI Agent) via $virt_traffic_type do PostHog — nunca usado
// pra identidade (visitor_id/sessionInternalId/user_id continuam vindo só
// de journey-session.ts/visitor-id.ts, sem relação com isto). Esta rota é
// o único ponto da nossa infra que vê o request direto do browser antes do
// hop server-to-server pra API Nest (Next → Nest), então é aqui que
// precisa ser lido — depois deste ponto, o user-agent/IP que a API Nest
// veria seria os do próprio processo Next, não os do visitante.
//
// x-forwarded-for: tomamos o primeiro hop, mesma convenção já usada em
// resolveIp() (apps/api/.../request-context.middleware.ts) — assume que o
// único proxy entre o browser e este handler é o edge da Railway. Se a
// topologia de proxy mudar, os dois pontos precisam mudar juntos.
//
// Nunca inventamos header ausente — se o header não vier, simplesmente
// não é reenviado (omitido), nunca substituído por um valor do servidor.
function resolveVisitorUserAgent(request: Request): string | null {
  const value = request.headers.get("user-agent")?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveVisitorIp(request: Request): string | null {
  const forwardedChain = request.headers.get("x-forwarded-for");
  if (!forwardedChain) return null;

  const firstHop = forwardedChain.split(",")[0]?.trim();
  return firstHop && firstHop.length > 0 ? firstHop : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const forwardedPosthogSessionId = request.headers
    .get("x-posthog-session-id")
    ?.trim();
  const visitorUserAgent = resolveVisitorUserAgent(request);
  const visitorIp = resolveVisitorIp(request);

  let bodySessionId: string | null = null;
  if (
    forwardedPosthogSessionId &&
    forwardedPosthogSessionId.length <= MAX_POSTHOG_SESSION_ID_LENGTH
  ) {
    bodySessionId = forwardedPosthogSessionId;
  } else {
    try {
      const parsed = JSON.parse(rawBody) as {
        metadata?: { $session_id?: unknown };
      };
      const candidate = parsed.metadata?.$session_id;
      if (
        typeof candidate === "string" &&
        candidate.trim().length > 0 &&
        candidate.trim().length <= MAX_POSTHOG_SESSION_ID_LENGTH
      ) {
        bodySessionId = candidate.trim();
      }
    } catch {
      bodySessionId = null;
    }
  }

  let body = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as {
      metadata?: Record<string, unknown>;
    };
    if (parsed && typeof parsed === "object" && parsed.metadata) {
      delete parsed.metadata.body;
      delete parsed.metadata.rawPayload;
      body = JSON.stringify(parsed);
    }
  } catch {
    body = rawBody;
  }

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/analysis-observability/business-funnel-events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bodySessionId ? { "x-posthog-session-id": bodySessionId } : {}),
        ...(visitorUserAgent
          ? { "x-visitor-user-agent": visitorUserAgent }
          : {}),
        ...(visitorIp ? { "x-visitor-ip": visitorIp } : {}),
      },
      body,
      cache: "no-store",
    },
  );

  const responseBody = await apiResponse.text();

  return new NextResponse(responseBody, {
    status: apiResponse.status,
    headers: {
      "Content-Type":
        apiResponse.headers.get("content-type") ?? "application/json",
    },
  });
}
