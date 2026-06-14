import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getCvAdaptationContent } from "@/lib/cv-adaptation-api";

import { AdaptacaoCvClient } from "./adaptacao-cv-client";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "CV Adaptado | EarlyCV",
};

export default async function AdaptacaoCvPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentAppUserFromCookies();
  if (!user) {
    redirect(`/entrar?next=/adaptacao-cv/${id}`);
  }

  let content: Awaited<ReturnType<typeof getCvAdaptationContent>>;
  try {
    content = await getCvAdaptationContent(id);
  } catch {
    redirect(`/adaptar/resultado?adaptationId=${id}`);
  }

  if (!content.isUnlocked) {
    redirect(`/adaptar/resultado?adaptationId=${id}`);
  }

  return (
    <AdaptacaoCvClient
      adaptationId={id}
      analysisData={content.adaptedContentJson}
      finalCvOutput={content.finalCvOutput ?? null}
      editedCvJson={content.editedCvJson ?? null}
      sectionMapping={content.sectionMapping ?? {}}
      jobTitle={content.jobTitle ?? null}
      companyName={content.companyName ?? null}
      adaptationStatus={content.status ?? null}
    />
  );
}
