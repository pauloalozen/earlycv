import { notFound } from "next/navigation";

import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";

import { CvBenchmarkClient } from "./_components/cv-benchmark-client";

export const metadata = buildAdminMetadata("CV Benchmark");

export default async function CvBenchmarkPage() {
  const token = await getBackofficeSessionToken();
  if (!token) notFound();

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="admin · lab"
        subtitle="Teste em massa do fluxo de adaptação de CV. Ferramenta interna — não afeta usuários."
        title="CV Benchmark."
      />
      <CvBenchmarkClient />
    </AdminPageWrap>
  );
}
