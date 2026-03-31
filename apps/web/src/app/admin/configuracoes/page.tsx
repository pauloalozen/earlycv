import { EmptyState } from "@/components/ui";

import { AdminShellHeader } from "../_components/admin-shell-header";

export default function AdminSettingsPage() {
  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / configuracoes"
          subtitle="Modulo base previsto para a Fase 4."
          title="Configuracoes"
        />
        <EmptyState
          description="Configuracoes administrativas avancadas entram num ciclo posterior."
          title="Modulo em evolucao"
        />
      </div>
    </div>
  );
}
