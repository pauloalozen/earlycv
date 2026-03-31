import { EmptyState } from "@/components/ui";

import { AdminShellHeader } from "../_components/admin-shell-header";

export default function AdminUsersPage() {
  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / usuarios"
          subtitle="Modulo reservado para a Fase 3, quando o admin operacional ganhar visibilidade de contas, perfis e curriculos."
          title="Usuarios"
        />
        <EmptyState
          description="Este modulo entra na Fase 3 com listagem e status de contas."
          title="Modulo em evolucao"
        />
      </div>
    </div>
  );
}
