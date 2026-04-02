import { NextResponse } from "next/server";

import { getDefaultAppRedirectPath } from "@/lib/app-session";
import { persistAppSession } from "@/lib/app-session.server";
import { loginWithPassword, parseAuthApiError } from "@/lib/auth-api";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    const session = await loginWithPassword(email, password);

    await persistAppSession(session);

    return NextResponse.redirect(
      new URL(getDefaultAppRedirectPath(session.user), request.url),
    );
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
