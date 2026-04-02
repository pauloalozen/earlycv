import { NextResponse } from "next/server";
import { persistAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, registerWithPassword } from "@/lib/auth-api";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  try {
    const session = await registerWithPassword(email, password, name);

    await persistAppSession(session);

    return NextResponse.redirect(new URL("/verificar-email", request.url));
  } catch (error) {
    const authError = parseAuthApiError(error);

    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(authError.message)}`,
        request.url,
      ),
    );
  }
}
