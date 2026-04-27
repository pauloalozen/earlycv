import { NextResponse } from "next/server";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentAppUserFromCookies();
    return NextResponse.json({ authenticated: Boolean(user) });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
