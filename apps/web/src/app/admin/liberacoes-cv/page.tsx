import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card } from "@/components/ui";
import { listAdminCvUnlocks } from "@/lib/admin-cv-unlocks-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";

export const metadata = buildAdminMetadata("Liberacoes de CV");

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SearchParams = {
  email?: string;
  userId?: string;
  cvAdaptationId?: string;
  source?: "CREDIT" | "ADMIN" | "PLAN_ENTITLEMENT" | "LEGACY";
  status?: "UNLOCKED" | "REVOKED";
  dateFrom?: string;
  dateTo?: string;
  page?: string;
};

export default async function AdminCvUnlocksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) : 1;

  const response = await listAdminCvUnlocks({
    email: sp.email,
    userId: sp.userId,
    cvAdaptationId: sp.cvAdaptationId,
    source: sp.source,
    status: sp.status,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    page,
    limit: 50,
  });

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      email: sp.email,
      userId: sp.userId,
      cvAdaptationId: sp.cvAdaptationId,
      source: sp.source,
      status: sp.status,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      page: String(page),
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/admin/liberacoes-cv?${params}`;
  };

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / liberacoes-cv"
          subtitle={`${response.total} registro${response.total !== 1 ? "s" : ""} encontrado${response.total !== 1 ? "s" : ""}.`}
          title="Liberacoes de CV"
        />

        <Card padding="sm" variant="ghost">
          <form
            action="/admin/liberacoes-cv"
            className="flex flex-wrap gap-3"
            method="GET"
          >
            <input
              className="h-10 w-52 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.email ?? ""}
              name="email"
              placeholder="Email"
            />
            <input
              className="h-10 w-52 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.userId ?? ""}
              name="userId"
              placeholder="User ID"
            />
            <input
              className="h-10 w-64 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.cvAdaptationId ?? ""}
              name="cvAdaptationId"
              placeholder="CV Adaptation ID"
            />
            <select
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-900"
              defaultValue={sp.source ?? ""}
              name="source"
            >
              <option value="">Todas as origens</option>
              <option value="CREDIT">Credito</option>
              <option value="PLAN_ENTITLEMENT">Plano</option>
              <option value="ADMIN">Admin</option>
              <option value="LEGACY">Legado</option>
            </select>
            <select
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-900"
              defaultValue={sp.status ?? ""}
              name="status"
            >
              <option value="">Todos os status</option>
              <option value="UNLOCKED">Liberado</option>
              <option value="REVOKED">Revogado</option>
            </select>
            <input
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.dateFrom ?? ""}
              name="dateFrom"
              type="date"
            />
            <input
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.dateTo ?? ""}
              name="dateTo"
              type="date"
            />
            <button className={buttonVariants()} type="submit">
              Filtrar
            </button>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin/liberacoes-cv"
            >
              Limpar
            </Link>
          </form>
        </Card>

        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 text-left">
              <tr>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Data
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Usuario
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Email
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  CV / Adaptacao
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Vaga
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Score
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Creditos
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Origem
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {response.items.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-stone-400"
                    colSpan={9}
                  >
                    Nenhuma liberacao encontrada.
                  </td>
                </tr>
              )}
              {response.items.map((item) => (
                <tr className="hover:bg-stone-50" key={item.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                    {formatDate(item.unlockedAt)}
                  </td>
                  <td className="px-4 py-3 text-stone-800">
                    {item.userName ?? item.userId}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {item.userEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {item.cvAdaptationId}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {item.jobTitle ?? "—"}
                    {item.companyName ? ` @ ${item.companyName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {item.score ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {item.creditsConsumed}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{item.source}</td>
                  <td className="px-4 py-3 text-stone-600">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-stone-500">
          <span>
            Pagina {response.page} de {response.totalPages}
          </span>
          <div className="flex gap-2">
            {response.page > 1 && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={buildUrl({ page: String(response.page - 1) })}
              >
                ← Anterior
              </Link>
            )}
            {response.page < response.totalPages && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={buildUrl({ page: String(response.page + 1) })}
              >
                Proxima →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
