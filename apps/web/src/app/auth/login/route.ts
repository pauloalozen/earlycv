import { getDefaultAppRedirectPath } from "@/lib/app-session";
import { persistAppSession } from "@/lib/app-session.server";
import { loginWithPassword, parseAuthApiError } from "@/lib/auth-api";
import { createPostRedirectResponse } from "@/lib/route-response";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();

  try {
    const session = await loginWithPassword(email, password);

    await persistAppSession(session);

    const destination = next?.startsWith("/")
      ? next
      : getDefaultAppRedirectPath(session.user);

    return createPostRedirectResponse(request.url, destination);
  } catch (error) {
    const authError = parseAuthApiError(error);

    return createPostRedirectResponse(
      request.url,
      `/login?error=${encodeURIComponent(authError.message)}`,
    );
  }
}
