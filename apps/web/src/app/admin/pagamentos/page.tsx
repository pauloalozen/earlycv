import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card } from "@/components/ui";
import { listAdminPayments } from "@/lib/admin-payments-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";

export const metadata = buildAdminMetadata("Pagamentos");

function statusLabel(status: string) {
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
    return "text-emerald-700 bg-emerald-50";
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
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / pagamentos"
          subtitle={`${total} registro${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}.`}
          title="Pagamentos"
        />

        <Card padding="sm" variant="ghost">
          <form
            action="/admin/pagamentos"
            className="flex flex-wrap gap-3"
            method="GET"
          >
            <select
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-900"
              defaultValue={sp.status ?? ""}
              name="status"
            >
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="completed">Aprovado</option>
              <option value="failed">Falhou</option>
            </select>
            <input
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.from ?? ""}
              name="from"
              type="date"
            />
            <input
              className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.to ?? ""}
              name="to"
              type="date"
            />
            <input
              className="h-10 w-64 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700"
              defaultValue={sp.userId ?? ""}
              name="userId"
              placeholder="User ID"
            />
            <button className={buttonVariants()} type="submit">
              Filtrar
            </button>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin/pagamentos"
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
                  Usuario
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Plano
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Status
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Valor
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Data
                </th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {items.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-stone-400"
                    colSpan={6}
                  >
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr className="hover:bg-stone-50" key={item.checkoutId}>
                  <td className="max-w-[160px] truncate px-4 py-3 font-medium text-stone-800">
                    {item.userEmail ?? item.userId}
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
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {formatCents(item.amountInCents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={`/admin/pagamentos/${item.checkoutId}`}
                    >
                      Detalhe
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-stone-500">
          <span>
            Pagina {page} · {items.length} de {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={buildUrl({ page: String(page - 1) })}
              >
                ← Anterior
              </Link>
            )}
            {items.length === 50 && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={buildUrl({ page: String(page + 1) })}
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
