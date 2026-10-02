import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminStatCard,
  AdminStatsRow,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/app/admin/_components/admin-primitives";
import {
  listAdminMockInterviews,
  type MockInterviewSessionStatus,
  ORIGIN_LABELS,
  PAYMENT_STATUS_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/admin-mock-interviews-api";
import {
  getMockInterviewMode,
  type MockInterviewMode,
} from "@/lib/mock-interview-mode";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { sessionTone } from "./_components/session-tone";

export const metadata = buildAdminMetadata("Entrevistas simuladas");

const PAGE_SIZE = 25;
const SESSION_FILTERS = Object.keys(
  SESSION_STATUS_LABELS,
) as MockInterviewSessionStatus[];
const PAYMENT_FILTERS = ["paid", "pending", "refunded", "all"] as const;

function formatCents(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const MODE_LABEL: Record<MockInterviewMode, string> = {
  off: "off · venda desligada",
  admin: "admin · só staff",
  on: "on · aberta a todos",
};
const MODE_TONE = { off: "neutral", admin: "warn", on: "ok" } as const;

// Flag MOCK_INTERVIEW_MODE: a API (gate real) e o web (exibição) têm cada um
// a sua variável. Divergência = algo aparece e não funciona, ou vice-versa.
function ModeNotice({
  apiMode,
  webMode,
}: {
  apiMode: MockInterviewMode;
  webMode: MockInterviewMode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        margin: "0 0 20px",
        fontSize: 13,
        color: "#5c5a52",
      }}
    >
      <span>Modo da venda:</span>
      <span>API</span>
      <AdminPill mono tone={MODE_TONE[apiMode]}>
        {MODE_LABEL[apiMode]}
      </AdminPill>
      <span>Web</span>
      <AdminPill mono tone={MODE_TONE[webMode]}>
        {MODE_LABEL[webMode]}
      </AdminPill>
      {apiMode !== webMode && (
        <AdminPill tone="danger">
          Divergente: ajuste MOCK_INTERVIEW_MODE (API) e
          NEXT_PUBLIC_MOCK_INTERVIEW_MODE (web)
        </AdminPill>
      )}
    </div>
  );
}

type SearchParams = {
  page?: string;
  payment?: string;
  session?: string;
  q?: string;
};

export default async function AdminSimuladosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const payment = PAYMENT_FILTERS.find((p) => p === sp.payment) ?? "paid";
  const session = SESSION_FILTERS.find((s) => s === sp.session);
  const q = sp.q?.trim() || undefined;

  const {
    items,
    total,
    summary,
    mode: apiMode,
  } = await listAdminMockInterviews({
    page,
    limit: PAGE_SIZE,
    payment,
    session,
    q,
  });

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      payment,
      session,
      q,
      page: String(page),
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/admin/simulados?${params}`;
  };

  const inputStyle = {
    borderColor: "rgba(10,10,10,0.08)",
    background: "#fafaf6",
    color: "#2a2620",
  };

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="admin · entrevistas simuladas"
        subtitle="Vendas avulsas da entrevista simulada. Registre aqui o horário combinado no WhatsApp, o link do Meet, se a sessão aconteceu e o envio do relatório."
        title="Entrevistas simuladas."
      />

      <ModeNotice apiMode={apiMode} webMode={getMockInterviewMode()} />

      <AdminStatsRow cols={4}>
        <AdminStatCard
          href="/admin/simulados?session=AWAITING_SCHEDULING"
          label="Aguardando agenda"
          sub="pagas, sem horário marcado"
          value={String(summary.awaitingScheduling)}
        />
        <AdminStatCard
          href="/admin/simulados?session=SCHEDULED"
          label="Agendadas"
          value={String(summary.scheduled)}
        />
        <AdminStatCard
          href="/admin/simulados?session=COMPLETED"
          label="Realizadas"
          sub={`${summary.noShow} não compareceram`}
          value={String(summary.completed)}
        />
        <AdminStatCard
          label="Receita (pagas)"
          sub={`${summary.paidCount} venda${summary.paidCount === 1 ? "" : "s"}`}
          value={formatCents(summary.revenueInCents)}
        />
      </AdminStatsRow>

      <form
        action="/admin/simulados"
        className="mb-4 mt-6 flex flex-wrap gap-2"
        method="GET"
      >
        <select
          className="h-9 rounded-md border px-3 text-[12.5px] font-medium"
          defaultValue={payment}
          name="payment"
          style={inputStyle}
        >
          <option value="paid">Pagas</option>
          <option value="pending">Pagamento pendente / recusado</option>
          <option value="refunded">Estornadas</option>
          <option value="all">Todas</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px] font-medium"
          defaultValue={session ?? ""}
          name="session"
          style={inputStyle}
        >
          <option value="">Todos os status da sessão</option>
          {SESSION_FILTERS.map((status) => (
            <option key={status} value={status}>
              {SESSION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <input
          className="h-9 w-64 rounded-md border px-3 text-[12.5px]"
          defaultValue={q ?? ""}
          name="q"
          placeholder="Nome, e-mail ou código do pedido"
          style={inputStyle}
        />
        <button className={buttonVariants()} type="submit">
          Filtrar
        </button>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/admin/simulados"
        >
          Limpar
        </Link>
      </form>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh w={90}>Pedido</AdminTh>
            <AdminTh>Comprador</AdminTh>
            <AdminTh w={110}>Pagamento</AdminTh>
            <AdminTh w={150}>Sessão</AdminTh>
            <AdminTh w={150}>Agendada para</AdminTh>
            <AdminTh w={90}>Relatório</AdminTh>
            <AdminTh w={150}>Comprada em</AdminTh>
            <AdminTh align="right" w={90}>
              Ações
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td
                colSpan={8}
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8a8580",
                  fontSize: 13,
                }}
              >
                Nenhuma entrevista simulada encontrada.
              </td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={item.id}>
              <AdminTd mono>#{item.code}</AdminTd>
              <AdminTd>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontWeight: 500 }}>
                    {item.buyer.name || "—"}
                  </span>
                  <span style={{ color: "#8a8580", fontSize: 12 }}>
                    {item.buyer.email} ·{" "}
                    {ORIGIN_LABELS[item.origin] ?? item.origin}
                  </span>
                </div>
              </AdminTd>
              <AdminTd>
                <AdminPill
                  mono
                  tone={
                    item.paymentStatus === "paid"
                      ? "ok"
                      : item.paymentStatus === "pending"
                        ? "warn"
                        : "danger"
                  }
                >
                  {PAYMENT_STATUS_LABELS[item.paymentStatus]}
                </AdminPill>
              </AdminTd>
              <AdminTd>
                <AdminPill tone={sessionTone(item.sessionStatus)}>
                  {SESSION_STATUS_LABELS[item.sessionStatus]}
                </AdminPill>
              </AdminTd>
              <AdminTd mono muted>
                {formatDate(item.scheduledAt)}
              </AdminTd>
              <AdminTd>
                {item.reportSentAt ? (
                  <AdminPill tone="ok">Enviado</AdminPill>
                ) : (
                  <span style={{ color: "#a8a39d" }}>—</span>
                )}
              </AdminTd>
              <AdminTd mono muted>
                {formatDate(item.paidAt ?? item.createdAt)}
              </AdminTd>
              <AdminTd align="right">
                <Link
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                  href={`/admin/simulados/${item.id}`}
                >
                  Abrir
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
        {page * PAGE_SIZE < total && (
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
