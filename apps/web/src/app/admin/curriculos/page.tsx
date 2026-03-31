import { EmptyState } from "@/components/ui";

import { AdminShellHeader } from "../_components/admin-shell-header";

export default function AdminResumesPage() {
  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / curriculos"
          subtitle="Modulo planejado para a Fase 3."
          title="Curriculos"
        />
        <EmptyState
          description="Acompanhamento de curriculos e curriculo principal entra na Fase 3."
          title="Modulo em evolucao"
        />
      </div>
    </div>
  );
}
