import { persistAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, registerWithPassword } from "@/lib/auth-api";
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

  try {
    const session = await registerWithPassword(email, password, name);
    await persistAppSession(session);

    const verifyUrl = next
      ? `/verificar-email?next=${encodeURIComponent(next)}`
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
