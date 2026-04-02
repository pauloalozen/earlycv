import { getDefaultAppRedirectPath } from "@/lib/app-session";
import { getCurrentAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, verifyEmailCode } from "@/lib/auth-api";
import { createPostRedirectResponse } from "@/lib/route-response";

export async function POST(request: Request) {
  const session = await getCurrentAppSession();

  if (!session) {
    return createPostRedirectResponse(request.url, "/login");
  }

  const formData = await request.formData();
  const code = String(formData.get("code") ?? "").trim();

  try {
    const user = await verifyEmailCode(session.accessToken, code);

    return createPostRedirectResponse(
      request.url,
      getDefaultAppRedirectPath(user),
    );
  } catch (error) {
    const authError = parseAuthApiError(error);

    return createPostRedirectResponse(
      request.url,
      `/verificar-email?error=${encodeURIComponent(authError.message)}`,
    );
  }
}
