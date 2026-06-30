import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { APP_ACCESS_TOKEN_COOKIE_NAME } from "@/lib/app-session";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

export const dynamic = "force-dynamic";

type RecoveryPageProps = {
  params: Promise<{ token: string }>;
};

export default async function RecoveryPage({ params }: RecoveryPageProps) {
  const { token } = await params;
  const cookieStore = await cookies();
  const headerStore = await headers();
  const accessToken =
    cookieStore.get(APP_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;

  const requestHeaders: Record<string, string> = {
    Cookie: cookieStore.toString(),
    "user-agent": headerStore.get("user-agent") ?? "",
    "x-request-id": headerStore.get("x-request-id") ?? "",
  };

  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${getApiBaseUrl()}/payment-recovery/${token}`, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers: requestHeaders,
  });

  const location = response.headers.get("location");
  if (location) {
    const locationUrl = new URL(location, "https://earlycv.com.br");
    if (locationUrl.pathname === "/recuperar-pagamento") {
      notFound();
    }
    redirect(location);
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404
  ) {
    notFound();
  }

  notFound();
}
