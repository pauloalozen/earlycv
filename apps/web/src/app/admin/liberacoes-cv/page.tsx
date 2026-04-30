import type { Metadata } from "next";
import Link from "next/link";

import { listAdminCvUnlocks } from "@/lib/admin-cv-unlocks-api";

export const metadata: Metadata = { title: "Liberações de CV" };

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
    <div className="px-6 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Liberações de CV</h1>
        <p className="text-sm text-stone-500 mt-1">
          {response.total} registro{response.total !== 1 ? "s" : ""} encontrado
          {response.total !== 1 ? "s" : ""}
        </p>
      </div>

      <form method="GET" action="/admin/liberacoes-cv" className="flex flex-wrap gap-3 mb-6">
        <input name="email" defaultValue={sp.email ?? ""} placeholder="Email" className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700 w-56" />
        <input name="userId" defaultValue={sp.userId ?? ""} placeholder="User ID" className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700 w-56" />
        <input name="cvAdaptationId" defaultValue={sp.cvAdaptationId ?? ""} placeholder="CV Adaptation ID" className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700 w-64" />

        <select name="source" defaultValue={sp.source ?? ""} className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700">
          <option value="">Todas as origens</option>
          <option value="CREDIT">Crédito</option>
          <option value="PLAN_ENTITLEMENT">Plano</option>
          <option value="ADMIN">Admin</option>
          <option value="LEGACY">Legado</option>
        </select>

        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700">
          <option value="">Todos os status</option>
          <option value="UNLOCKED">Liberado</option>
          <option value="REVOKED">Revogado</option>
        </select>

        <input name="dateFrom" type="date" defaultValue={sp.dateFrom ?? ""} className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700" />
        <input name="dateTo" type="date" defaultValue={sp.dateTo ?? ""} className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700" />

        <button type="submit" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Filtrar</button>
        <Link href="/admin/liberacoes-cv" className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Limpar</Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">CV / Adaptação</th>
              <th className="px-4 py-3">Vaga</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Créditos</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {response.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-stone-400">Nenhuma liberação encontrada.</td>
              </tr>
            ) : null}
            {response.items.map((item) => (
              <tr key={item.id} className="hover:bg-stone-50">
                <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{formatDate(item.unlockedAt)}</td>
                <td className="px-4 py-3 text-stone-800">{item.userName ?? item.userId}</td>
                <td className="px-4 py-3 text-stone-600">{item.userEmail ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-stone-500">{item.cvAdaptationId}</td>
                <td className="px-4 py-3 text-stone-600">{item.jobTitle ?? "—"}{item.companyName ? ` @ ${item.companyName}` : ""}</td>
                <td className="px-4 py-3 text-stone-600">{item.score ?? "—"}</td>
                <td className="px-4 py-3 text-stone-700">{item.creditsConsumed}</td>
                <td className="px-4 py-3 text-stone-600">{item.source}</td>
                <td className="px-4 py-3 text-stone-600">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
        <span>Página {response.page} de {response.totalPages}</span>
        <div className="flex gap-2">
          {response.page > 1 ? (
            <Link href={buildUrl({ page: String(response.page - 1) })} className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100">← Anterior</Link>
          ) : null}
          {response.page < response.totalPages ? (
            <Link href={buildUrl({ page: String(response.page + 1) })} className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100">Próxima →</Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
