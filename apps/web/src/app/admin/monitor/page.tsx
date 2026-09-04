import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { MatchingTabContent } from "../ingestion/_components/matching-tab-content";

// A partir de 2026-09-04 esta tela ficou como aba "Matching" dentro de
// Ingestão (/admin/ingestion?tab=matching) — ver
// docs/specs/2026-09-04-admin-alerta-vagas-tab.md. A rota standalone
// continua funcionando (é a mesma MatchingTabContent) pra não quebrar
// links/bookmarks antigos, mas não está mais no menu principal.
export const metadata = buildAdminMetadata("Radar — Matching");

type PageProps = {
  searchParams: Promise<{ userQuery?: string; jobQuery?: string }>;
};

export default async function AdminMonitorPage({ searchParams }: PageProps) {
  const { userQuery, jobQuery } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/monitor");
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Radar"
        title="Diagnóstico de matching"
        subtitle="Ferramenta de investigação do motor de matching — não é um dashboard executivo. Tudo sobre disparo/e-mail do Alerta agora fica em Alerta de Vagas. Use a busca abaixo para abrir o diagnóstico completo de um usuário ou vaga."
      />
      <MatchingTabContent
        token={token}
        userQuery={userQuery}
        jobQuery={jobQuery}
        redirectPath="/admin/monitor"
      />
    </AdminPageWrap>
  );
}
