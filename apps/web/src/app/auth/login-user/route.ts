import { getDefaultAppRedirectPath } from "@/lib/app-session";
import { persistAppSession } from "@/lib/app-session.server";
import { loginWithPassword, parseAuthApiError } from "@/lib/auth-api";
import { createPostRedirectResponse } from "@/lib/route-response";

function sanitizeNext(next: string | undefined): string {
  const raw = next?.trim();
  if (!raw) {
    return "/meu-perfil";
  }

  const normalized = raw.startsWith("%")
    ? (() => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })()
    : raw;

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/meu-perfil";
  }
  return normalized;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();

  try {
    const session = await loginWithPassword(email, password);
    await persistAppSession(session);

    const destination = next
      ? sanitizeNext(next)
      : getDefaultAppRedirectPath(session.user);

    return createPostRedirectResponse(request.url, destination);
  } catch (error) {
    const authError = parseAuthApiError(error);
    const params = new URLSearchParams({
      tab: "entrar",
      error: authError.message,
      ...(next && { next }),
    });
    return createPostRedirectResponse(request.url, `/entrar?${params}`);
  }
}
