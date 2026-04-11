import { persistAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, registerWithPassword } from "@/lib/auth-api";
import { createPostRedirectResponse } from "@/lib/route-response";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  try {
    const session = await registerWithPassword(email, password, name);

    await persistAppSession(session);

    return createPostRedirectResponse(request.url, "/verificar-email");
  } catch (error) {
    const authError = parseAuthApiError(error);

    return createPostRedirectResponse(
      request.url,
      `/entrar?error=${encodeURIComponent(authError.message)}`,
    );
  }
}
