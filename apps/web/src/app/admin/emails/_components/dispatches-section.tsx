import Link from "next/link";

import {
  AdminCard,
  AdminFilterBar,
  AdminPagination,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type {
  EmailDispatchKind,
  EmailDispatchListItem,
  EmailDispatchStatus,
  Paginated,
} from "@/lib/admin-emails-api";
import {
  fmtDate,
  KIND_LABEL,
  reasonLabel,
  STATUS_LABEL,
  StatusPill,
} from "./email-labels";

const inputStyle = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid rgba(10,10,10,0.12)",
  fontSize: 12.5,
  fontFamily: "inherit",
  background: "#fafaf6",
};

// Lista de envios do dispatch (relacionamento ou compras) com filtro por
// status (e tipo, no relacionamento) e paginação por querystring — filtros em
// <form method="get">, sem JavaScript no cliente.
export function DispatchesSection({
  basePath,
  kinds,
  listing,
  filters,
}: {
  basePath: string;
  kinds: EmailDispatchKind[];
  listing: Paginated<EmailDispatchListItem>;
  filters: { kind?: EmailDispatchKind; status?: EmailDispatchStatus };
}) {
  const query = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.status) params.set("status", filters.status);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <AdminCard>
      <form method="get" action={basePath}>
        <AdminFilterBar>
          {kinds.length > 1 ? (
            <select
              name="kind"
              defaultValue={filters.kind ?? ""}
              style={inputStyle}
            >
              <option value="">Todos os tipos</option>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          ) : null}
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            style={inputStyle}
          >
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_LABEL) as EmailDispatchStatus[]).map(
              (status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ),
            )}
          </select>
          <button
            type="submit"
            style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}
          >
            Filtrar
          </button>
        </AdminFilterBar>
      </form>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Tipo</AdminTh>
            <AdminTh>Destinatário</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Motivo</AdminTh>
            <AdminTh>Agendado</AdminTh>
            <AdminTh>Enviado</AdminTh>
            <AdminTh align="right">Tent.</AdminTh>
            <AdminTh w={70}>{null}</AdminTh>
          </tr>
        </thead>
        <tbody>
          {listing.items.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                style={{ padding: 16, fontSize: 13, color: AT.muted2 }}
              >
                Nenhum envio por enquanto. Com os modos desligados (padrão) nada
                é criado; em modo sombra as linhas aparecem como "Descartado —
                modo sombra".
              </td>
            </tr>
          ) : (
            listing.items.map((item) => (
              <tr key={item.id}>
                <AdminTd>{KIND_LABEL[item.kind]}</AdminTd>
                <AdminTd>{item.recipientEmail}</AdminTd>
                <AdminTd>
                  <StatusPill status={item.status} />
                </AdminTd>
                <AdminTd>
                  {item.skippedReason
                    ? reasonLabel(item.skippedReason)
                    : (item.lastError ?? "—")}
                </AdminTd>
                <AdminTd>{fmtDate(item.scheduledFor)}</AdminTd>
                <AdminTd>{fmtDate(item.sentAt)}</AdminTd>
                <AdminTd align="right">{item.attempts}</AdminTd>
                <AdminTd>
                  <Link
                    href={`/admin/emails/envios/${item.id}`}
                    style={{ fontSize: 12.5, fontWeight: 600 }}
                  >
                    Abrir
                  </Link>
                </AdminTd>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`${listing.total} envio${listing.total === 1 ? "" : "s"}`}
      >
        {listing.page > 1 ? (
          <Link href={query(listing.page - 1)}>Anterior</Link>
        ) : null}
        {listing.page * listing.limit < listing.total ? (
          <Link href={query(listing.page + 1)}>Próxima</Link>
        ) : null}
      </AdminPagination>
    </AdminCard>
  );
}
