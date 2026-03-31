import { EmptyState } from "@/components/ui";

import { AdminShellHeader } from "../_components/admin-shell-header";

export default function AdminProfilesPage() {
  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / perfis"
          subtitle="Modulo planejado para a Fase 3."
          title="Perfis"
        />
        <EmptyState
          description="Acompanhamento de completude de perfis entra na Fase 3."
          title="Modulo em evolucao"
        />
      </div>
    </div>
  );
}
