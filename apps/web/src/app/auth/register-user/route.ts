import { persistAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, registerWithPassword } from "@/lib/auth-api";
import {
  buildClaimResultDestination,
  claimGuestAnalysisJobServerSide,
} from "@/lib/guest-analysis-claim.server";
import { createPostRedirectResponse } from "@/lib/route-response";

function sanitizeNext(next: string | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "";
  return next;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const next = sanitizeNext(String(formData.get("next") ?? "").trim());
  const conversionContext =
    String(formData.get("conversionContext") ?? "").trim() || undefined;
  const sessionInternalId =
    String(formData.get("sessionInternalId") ?? "").trim() || undefined;
  const visitorId = String(formData.get("visitorId") ?? "").trim() || undefined;
  const guestAnalysisJobId =
    String(formData.get("guestAnalysisJobId") ?? "").trim() || undefined;
  const guestPossessionToken =
    String(formData.get("guestPossessionToken") ?? "").trim() || undefined;

  try {
    const session = await registerWithPassword(
      email,
      password,
      name,
      conversionContext,
      sessionInternalId,
      visitorId,
    );
    await persistAppSession(session);

    // Fase 5: cadastro por email não bloqueia em verificação para reivindicar
    // a análise guest — a conta já existe e já tem sessão válida (mesmo
    // padrão de outras rotas protegidas por JwtAuthGuard, que não exigem
    // email verificado). Nunca bloqueia o cadastro se isso falhar.
    const claimedNext = guestAnalysisJobId
      ? buildClaimResultDestination(
          await claimGuestAnalysisJobServerSide(
            session.accessToken,
            guestAnalysisJobId,
            guestPossessionToken,
          ),
          guestAnalysisJobId,
          next || "/dashboard",
        )
      : next;

    const verifyUrl = claimedNext
      ? `/verificar-email?next=${encodeURIComponent(claimedNext)}`
      : "/verificar-email";

    return createPostRedirectResponse(request.url, verifyUrl);
  } catch (error) {
    const authError = parseAuthApiError(error);
    const params = new URLSearchParams({
      tab: "cadastro",
      error: authError.message,
      ...(next && { next }),
    });
    return createPostRedirectResponse(request.url, `/entrar?${params}`);
  }
}
