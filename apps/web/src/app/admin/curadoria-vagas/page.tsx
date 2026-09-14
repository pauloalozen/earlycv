import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { CuradoriaVagasClient } from "./_components/curadoria-vagas-client";

export const metadata = buildAdminMetadata("Curadoria de Vagas");

export default async function AdminCuradoriaVagasPage() {
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel(
      "missing-token",
      "/admin/curadoria-vagas",
    );
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
        title="Curadoria de Vagas"
        subtitle="Encontre vagas capturadas recentemente que aparentemente ainda não estão no LinkedIn, pra divulgação diária. A busca é manual — o botão abaixo só monta a pesquisa pronta no Google."
      />
      <CuradoriaVagasClient />
    </AdminPageWrap>
  );
}
