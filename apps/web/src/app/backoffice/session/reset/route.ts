import { createSessionTerminationResponse } from "@/lib/route-response";

const DEFAULT_REDIRECT_PATH = "/";

function getSafeRedirectPath(next: string | null) {
  if (!next?.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return next.startsWith("//") ? DEFAULT_REDIRECT_PATH : next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = getSafeRedirectPath(url.searchParams.get("next"));

  return createSessionTerminationResponse(url.toString(), next);
}
