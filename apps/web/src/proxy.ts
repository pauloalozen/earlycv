import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const redirectUrl = new URL("/", request.url);

  return Response.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/jobs", "/jobs/:path*"],
};
