import type { Metadata } from "next";
import Link from "next/link";

import { listAdminPayments } from "@/lib/admin-payments-api";

export const metadata: Metadata = { title: "Pagamentos" };

function statusLabel(status: string, _type: "plan" | "adaptation") {
  const map: Record<string, string> = {
    completed: "Aprovado",
    pending: "Pendente",
    failed: "Falhou",
    none: "Sem pagamento",
    refunded: "Reembolsado",
  };
  return map[status] ?? status;
}

function statusClass(status: string) {
  if (status === "completed" || status === "approved")
    return "text-green-700 bg-green-50";
  if (status === "pending") return "text-yellow-700 bg-yellow-50";
  if (status === "failed") return "text-red-700 bg-red-50";
  return "text-stone-600 bg-stone-100";
}

function formatCents(cents: number | null) {
  if (cents === null) return "—";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

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
  type?: string;
  status?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function AdminPagamentosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) : 1;

  const { items, total } = await listAdminPayments({
    type: sp.type as "plan" | "adaptation" | undefined,
    status: sp.status,
    userId: sp.userId,
    from: sp.from,
    to: sp.to,
    page,
    limit: 50,
  });

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      type: sp.type,
      status: sp.status,
      userId: sp.userId,
      from: sp.from,
      to: sp.to,
      page: String(page),
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return `/admin/pagamentos?${params}`;
  };

  return (
    <div className="px-6 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Pagamentos</h1>
        <p className="text-sm text-stone-500 mt-1">
          {total} registro{total !== 1 ? "s" : ""} encontrado
          {total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filtros */}
      <form
        method="GET"
        action="/admin/pagamentos"
        className="flex flex-wrap gap-3 mb-6"
      >
        <select
          name="type"
          defaultValue={sp.type ?? ""}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700"
        >
          <option value="">Todos os tipos</option>
          <option value="plan">Plano</option>
          <option value="adaptation">Adaptação</option>
        </select>

        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="completed">Aprovado</option>
          <option value="failed">Falhou</option>
        </select>

        <input
          name="from"
          type="date"
          defaultValue={sp.from ?? ""}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700"
          placeholder="De"
        />
        <input
          name="to"
          type="date"
          defaultValue={sp.to ?? ""}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700"
          placeholder="Até"
        />

        <input
          name="userId"
          defaultValue={sp.userId ?? ""}
          placeholder="User ID"
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm bg-white text-stone-700 w-64"
        />

        <button
          type="submit"
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Filtrar
        </button>
        <Link
          href="/admin/pagamentos"
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Limpar
        </Link>
      </form>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Plano / Adaptação</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-stone-400"
                >
                  Nenhum pagamento encontrado.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.checkoutId} className="hover:bg-stone-50">
                <td className="px-4 py-3 font-mono text-xs text-stone-500">
                  {item.type === "plan" ? "Plano" : "Adaptação"}
                </td>
                <td className="px-4 py-3">
                  <div className="text-stone-800 font-medium truncate max-w-[160px]">
                    {item.userEmail ?? item.userId}
                  </div>
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {item.planName ?? (
                    <span className="font-mono text-xs">
                      {item.checkoutId.slice(0, 8)}…
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(item.status)}`}
                  >
                    {statusLabel(item.status, item.type)}
                  </span>
                </td>
                <td className="px-4 py-3 text-stone-700">
                  {formatCents(item.amountInCents)}
                </td>
                <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                  {formatDate(item.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/pagamentos/${item.checkoutId}`}
                    className="text-xs font-medium text-orange-700 hover:underline"
                  >
                    Ver detalhes
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
        <span>
          Página {page} · {items.length} de {total}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100"
            >
              ← Anterior
            </Link>
          )}
          {items.length === 50 && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100"
            >
              Próxima →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
