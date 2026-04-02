import { NextResponse } from "next/server";

import { getDefaultAppRedirectPath } from "@/lib/app-session";
import { getCurrentAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, verifyEmailCode } from "@/lib/auth-api";

export async function POST(request: Request) {
  const session = await getCurrentAppSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const formData = await request.formData();
  const code = String(formData.get("code") ?? "").trim();

  try {
    const user = await verifyEmailCode(session.accessToken, code);

    return NextResponse.redirect(
      new URL(getDefaultAppRedirectPath(user), request.url),
    );
  } catch (error) {
    const authError = parseAuthApiError(error);

    return NextResponse.redirect(
      new URL(
        `/verificar-email?error=${encodeURIComponent(authError.message)}`,
        request.url,
      ),
    );
  }
}
