import { type NextRequest, NextResponse } from "next/server";
import { getDefaultAppRedirectPath } from "@/lib/app-session";
import {
  fetchCurrentAppUser,
  persistAppSession,
} from "@/lib/app-session.server";
import {
  buildClaimResultDestination,
  claimGuestAnalysisJobServerSide,
} from "@/lib/guest-analysis-claim.server";

function sanitizeCookieNext(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  return decoded;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accessToken = searchParams.get("accessToken");
  const refreshToken = searchParams.get("refreshToken");

  if (!accessToken || !refreshToken) {
    return NextResponse.redirect(
      new URL("/entrar?error=social-auth-failed", request.url),
    );
  }

  const user = await fetchCurrentAppUser(accessToken);

  if (!user) {
    return NextResponse.redirect(
      new URL("/entrar?error=social-auth-failed", request.url),
    );
  }

  await persistAppSession({ accessToken, refreshToken, user });

  const nextCookie = request.cookies.get("post_auth_next")?.value;
  const fallbackDestination =
    sanitizeCookieNext(nextCookie) ?? getDefaultAppRedirectPath(user);

  // Fase 5: analysisJobId (Fase 3/4) só chega aqui depois de já ter sido
  // resolvido/consumido por state — ownership do AnalysisJob já foi
  // transferida no callback da API (transferAnalysisJobOwnership), então
  // não precisamos (nem devemos) reenviar guestPossessionToken aqui — ele
  // já foi gasto em POST /auth/oauth-attempts.
  const analysisJobId = searchParams.get("analysisJobId");
  const destination = analysisJobId
    ? buildClaimResultDestination(
        await claimGuestAnalysisJobServerSide(accessToken, analysisJobId),
        analysisJobId,
        fallbackDestination,
      )
    : fallbackDestination;

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set("post_auth_next", "", { maxAge: 0, path: "/" });
  return response;
}
