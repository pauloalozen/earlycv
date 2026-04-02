import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/app-session.server";
import { parseAuthApiError, resendVerificationCode } from "@/lib/auth-api";

export async function POST(request: Request) {
  const session = await getCurrentAppSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await resendVerificationCode(session.accessToken);

    return NextResponse.redirect(
      new URL("/verificar-email?resent=1", request.url),
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
