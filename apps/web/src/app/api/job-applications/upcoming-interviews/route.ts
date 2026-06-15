import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

type JobAppRaw = {
  id: string;
  status: string;
  jobTitle: string;
  companyName: string;
  nextActionAt: string | null;
  interviewTitle: string | null;
};

export async function GET() {
  try {
    const response = await apiRequest(
      "GET",
      "/job-applications?page=1&limit=50&archived=false",
    );
    if (!response.ok) {
      return NextResponse.json({ items: [] });
    }
    const data = (await response.json()) as { items: JobAppRaw[] };
    const now = new Date();
    const upcoming = data.items
      .filter(
        (a) =>
          a.status === "INTERVIEW" &&
          a.nextActionAt &&
          new Date(a.nextActionAt) > now,
      )
      .map((a) => ({
        id: a.id,
        jobTitle: a.jobTitle,
        companyName: a.companyName,
        nextActionAt: a.nextActionAt,
        interviewTitle: a.interviewTitle,
      }));
    return NextResponse.json({ items: upcoming });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
