import { getCurrentAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, resendVerificationCode } from "@/lib/auth-api";
import { createPostRedirectResponse } from "@/lib/route-response";

export async function POST(request: Request) {
  const session = await getCurrentAppSession();

  if (!session) {
    return createPostRedirectResponse(request.url, "/entrar");
  }

  try {
    await resendVerificationCode(session.accessToken);

    return createPostRedirectResponse(request.url, "/verificar-email?resent=1");
  } catch (error) {
    const authError = parseAuthApiError(error);

    return createPostRedirectResponse(
      request.url,
      `/verificar-email?error=${encodeURIComponent(authError.message)}`,
    );
  }
}
