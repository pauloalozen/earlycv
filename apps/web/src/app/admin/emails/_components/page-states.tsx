import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import { buildAdminStateModel } from "@/lib/admin-state";

// Estados padrão das telas da aba Emails (sem sessão de backoffice / erro
// inesperado) — mesmo componente das demais telas do admin.
export function MissingTokenState({ path }: { path: string }) {
  const state = buildAdminStateModel("missing-token", path);
  return (
    <div className="px-6 py-10 md:px-10">
      <AdminTokenState {...state} />
    </div>
  );
}

export function UnexpectedErrorState({ path }: { path: string }) {
  const state = buildAdminStateModel("unexpected-error", path);
  return (
    <div className="px-6 py-10 md:px-10">
      <AdminTokenState {...state} />
    </div>
  );
}
