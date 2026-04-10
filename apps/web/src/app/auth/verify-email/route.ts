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
  const next = String(formData.get("next") ?? "").trim();

  const sanitizedNext =
    next?.startsWith("/") && !next.startsWith("//") ? next : "";

  try {
    const user = await verifyEmailCode(session.accessToken, code);

    const destination = sanitizedNext || getDefaultAppRedirectPath(user);
    return createPostRedirectResponse(request.url, destination);
  } catch (error) {
    const authError = parseAuthApiError(error);
    const params = new URLSearchParams({
      error: authError.message,
      ...(sanitizedNext && { next: sanitizedNext }),
    });
    return createPostRedirectResponse(
      request.url,
      `/verificar-email?${params}`,
    );
  }
}
