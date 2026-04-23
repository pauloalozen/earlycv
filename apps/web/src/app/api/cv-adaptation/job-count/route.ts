import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const JOB_COUNT_CACHE_SECONDS = 30;

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function GET(request: NextRequest) {
  const jobTitle = request.nextUrl.searchParams.get("jobTitle") ?? "";
  const companyName = request.nextUrl.searchParams.get("companyName") ?? "";

  const params = new URLSearchParams();
  params.set("jobTitle", jobTitle);
  params.set("companyName", companyName);

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/job-count?${params.toString()}`,
    {
      next: { revalidate: JOB_COUNT_CACHE_SECONDS },
    },
  );

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    return NextResponse.json(
      { message: error },
      { status: apiResponse.status },
    );
  }

  const json = (await apiResponse.json()) as { count: number };
  return NextResponse.json(json, {
    headers: {
      "Cache-Control": `public, s-maxage=${JOB_COUNT_CACHE_SECONDS}, stale-while-revalidate=${JOB_COUNT_CACHE_SECONDS}`,
    },
  });
}
