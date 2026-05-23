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
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/liberacoes-cv"
          >
            ↓ Exportar CSV
          </Link>
        }
        eyebrow="admin · liberações de cv"
        subtitle={`Histórico de adaptações de CV liberadas para download, por crédito ou pacote. ${response.total} registro${response.total !== 1 ? "s" : ""}.`}
        title="Liberações de CV."
      />

      <form
        action="/admin/liberacoes-cv"
        className="mb-4 flex flex-wrap gap-2"
        method="GET"
      >
        <input
          className="h-9 w-48 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.email ?? ""}
          name="email"
          placeholder="Email"
        />
        <input
          className="h-9 w-48 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.userId ?? ""}
          name="userId"
          placeholder="User ID"
        />
        <input
          className="h-9 w-60 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.cvAdaptationId ?? ""}
          name="cvAdaptationId"
          placeholder="CV Adaptation ID"
        />
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.source ?? ""}
          name="source"
        >
          <option value="">origem: todas</option>
          <option value="CREDIT">Crédito</option>
          <option value="PLAN_ENTITLEMENT">Plano</option>
          <option value="ADMIN">Admin</option>
          <option value="LEGACY">Legado</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.status ?? ""}
          name="status"
        >
          <option value="">status: todos</option>
          <option value="UNLOCKED">Liberado</option>
          <option value="REVOKED">Revogado</option>
        </select>
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.dateFrom ?? ""}
          name="dateFrom"
          type="date"
        />
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
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

      <AdminTable>
        <thead>
          <tr>
            <AdminTh w={160}>Data</AdminTh>
            <AdminTh w={140}>Usuário</AdminTh>
            <AdminTh w={200}>Email</AdminTh>
            <AdminTh w={230}>CV / Adaptação</AdminTh>
            <AdminTh>Vaga</AdminTh>
            <AdminTh w={70} align="right">
              Score
            </AdminTh>
            <AdminTh w={80} align="right">
              Créditos
            </AdminTh>
            <AdminTh w={90}>Origem</AdminTh>
            <AdminTh w={100}>Status</AdminTh>
          </tr>
        </thead>
        <tbody>
          {response.items.length === 0 && (
            <tr>
              <td
                colSpan={9}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8a8580",
                  fontSize: 13,
                }}
              >
                Nenhuma liberação encontrada.
              </td>
            </tr>
          )}
          {response.items.map((item) => (
            <tr key={item.id}>
              <AdminTd mono muted>
                {formatDate(item.unlockedAt)}
              </AdminTd>
              <AdminTd>{item.userName ?? item.userId}</AdminTd>
              <AdminTd mono muted>
                {item.userEmail ?? "—"}
              </AdminTd>
              <AdminTd mono muted>
                {item.cvAdaptationId.slice(0, 24)}…
              </AdminTd>
              <AdminTd>
                {item.jobTitle ?? "—"}
                {item.companyName ? ` @ ${item.companyName}` : ""}
              </AdminTd>
              <AdminTd align="right" mono>
                {item.score ?? "—"}
              </AdminTd>
              <AdminTd align="right" mono>
                {item.creditsConsumed}
              </AdminTd>
              <AdminTd>
                <AdminPill tone="neutral" mono>
                  {item.source}
                </AdminPill>
              </AdminTd>
              <AdminTd>
                <AdminPill tone={item.status === "UNLOCKED" ? "ok" : "danger"}>
                  {item.status}
                </AdminPill>
              </AdminTd>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`página ${response.page} de ${response.totalPages}`}
      >
        {response.page > 1 && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildUrl({ page: String(response.page - 1) })}
          >
            ← anterior
          </Link>
        )}
        {response.page < response.totalPages && (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={buildUrl({ page: String(response.page + 1) })}
          >
            próxima →
          </Link>
        )}
      </AdminPagination>
    </AdminPageWrap>
  );
}
