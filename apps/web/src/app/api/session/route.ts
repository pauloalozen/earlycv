import { NextResponse } from "next/server";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentAppUserFromCookies();
    return NextResponse.json(
      {
        authenticated: Boolean(user),
        user: user
          ? {
              email: user.email,
              id: user.id,
              name: user.name,
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { authenticated: false, user: null },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  }
}
