import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/app/admin/_components/admin-primitives";
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

function _statusClass(status: string) {
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
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/pagamentos"
          >
            ↓ Exportar CSV
          </Link>
        }
        eyebrow="admin · pagamentos"
        subtitle={`Auditoria de transações por plano, status e período. ${total} registro${total !== 1 ? "s" : ""}.`}
        title="Pagamentos."
      />

      <form
        action="/admin/pagamentos"
        className="mb-4 flex flex-wrap gap-2"
        method="GET"
      >
        <select
          className="h-9 rounded-md border px-3 text-[12.5px] font-medium"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.status ?? ""}
          name="status"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="completed">Aprovado</option>
          <option value="failed">Falhou</option>
        </select>
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.from ?? ""}
          name="from"
          type="date"
        />
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.to ?? ""}
          name="to"
          type="date"
        />
        <input
          className="h-9 w-64 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.userId ?? ""}
          name="userId"
          placeholder="User ID ou email"
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

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Usuário</AdminTh>
            <AdminTh w={110}>Plano</AdminTh>
            <AdminTh w={140}>Status</AdminTh>
            <AdminTh w={120} align="right">
              Valor
            </AdminTh>
            <AdminTh w={180}>Data</AdminTh>
            <AdminTh w={100} align="right">
              Ações
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8a8580",
                  fontSize: 13,
                }}
              >
                Nenhum pagamento encontrado.
              </td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={item.checkoutId}>
              <AdminTd mono muted>
                {item.userEmail ?? item.userId}
              </AdminTd>
              <AdminTd>
                <AdminPill tone="neutral" mono>
                  {item.planName ?? item.checkoutId.slice(0, 8)}
                </AdminPill>
              </AdminTd>
              <AdminTd>
                <AdminPill
                  tone={
                    item.status === "completed" || item.status === "approved"
                      ? "ok"
                      : item.status === "pending"
                        ? "warn"
                        : item.status === "failed"
                          ? "danger"
                          : "neutral"
                  }
                  mono
                >
                  {statusLabel(item.status)}
                </AdminPill>
              </AdminTd>
              <AdminTd align="right" mono>
                {formatCents(item.amountInCents)}
              </AdminTd>
              <AdminTd mono muted>
                {formatDate(item.createdAt)}
              </AdminTd>
              <AdminTd align="right">
                <Link
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                  href={`/admin/pagamentos/${item.checkoutId}`}
                >
                  Detalhe
                </Link>
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <AdminPagination summary={`página ${page} · ${items.length} de ${total}`}>
        {page > 1 && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildUrl({ page: String(page - 1) })}
          >
            ← anterior
          </Link>
        )}
        {items.length === 50 && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildUrl({ page: String(page + 1) })}
          >
            próxima →
          </Link>
        )}
      </AdminPagination>
    </AdminPageWrap>
  );
}
