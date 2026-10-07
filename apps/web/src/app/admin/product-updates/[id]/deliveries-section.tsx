import Link from "next/link";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type {
  ProductUpdateDeliveryFilter,
  ProductUpdateDeliveryListItem,
  ProductUpdateDeliveryStatus,
} from "@/lib/admin-product-updates-api";

export const DELIVERY_FILTER_LABEL: Record<
  ProductUpdateDeliveryFilter,
  string
> = {
  sent: "Enviados",
  failed: "Falhas",
  outcome_unknown: "Indeterminados",
  cancelled: "Cancelados",
  opened: "Aberturas únicas",
  clicked: "Cliques únicos",
  bounced: "Bounces",
  complained: "Complaints",
  unsubscribed: "Descadastros",
};

const EVENT_FILTERS = new Set<ProductUpdateDeliveryFilter>([
  "opened",
  "clicked",
  "bounced",
  "complained",
]);

const EVENT_COLUMN: Partial<Record<ProductUpdateDeliveryFilter, string>> = {
  opened: "Primeira abertura",
  clicked: "Primeiro clique",
  bounced: "Bounce em",
  complained: "Complaint em",
};

const DETAIL_COLUMN: Partial<Record<ProductUpdateDeliveryFilter, string>> = {
  clicked: "Link",
  bounced: "Tipo",
  complained: "Tipo",
};

const STATUS_TONE: Record<
  ProductUpdateDeliveryStatus,
  "ok" | "danger" | "warn" | "info" | "neutral"
> = {
  PENDING: "info",
  PROCESSING: "info",
  SENT: "ok",
  FAILED: "danger",
  OUTCOME_UNKNOWN: "warn",
  CANCELLED: "neutral",
};

export function isDeliveryFilter(
  value: string | undefined,
): value is ProductUpdateDeliveryFilter {
  return value !== undefined && value in DELIVERY_FILTER_LABEL;
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function ProductUpdateDeliveriesSection({
  filter,
  data,
  rootPath,
}: {
  filter: ProductUpdateDeliveryFilter;
  data: {
    items: ProductUpdateDeliveryListItem[];
    total: number;
    page: number;
    limit: number;
  };
  rootPath: string;
}) {
  const isEvent = EVENT_FILTERS.has(filter);
  const detailColumn = DETAIL_COLUMN[filter];
  const showError = filter === "failed" || filter === "outcome_unknown";
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  function pageHref(page: number) {
    return `${rootPath}?filter=${filter}&deliveriesPage=${page}#entregas`;
  }

  return (
    <div id="entregas" style={{ marginBottom: 20, scrollMarginTop: 80 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          fontSize: 12,
          color: AT.muted,
        }}
      >
        <AdminPill tone="info">
          Filtro do card: {DELIVERY_FILTER_LABEL[filter]}
        </AdminPill>
        <Link href={rootPath} scroll={false} style={{ color: AT.info }}>
          Fechar lista
        </Link>
      </div>

      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Destinatário</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Enviado em</AdminTh>
            {isEvent ? <AdminTh>{EVENT_COLUMN[filter]}</AdminTh> : null}
            {isEvent ? <AdminTh align="right">Vezes</AdminTh> : null}
            {detailColumn ? <AdminTh>{detailColumn}</AdminTh> : null}
            {showError ? <AdminTh>Erro</AdminTh> : null}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <AdminTd>
                <div style={{ fontSize: 13, color: AT.ink2 }}>
                  {item.userId ? (
                    <Link
                      href={`/admin/usuarios/${item.userId}`}
                      style={{ color: AT.ink2 }}
                    >
                      {item.recipientName || "—"}
                    </Link>
                  ) : (
                    item.recipientName || "—"
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: AT.muted2,
                    fontFamily: '"Geist Mono", monospace',
                  }}
                >
                  {item.recipientEmail}
                </div>
              </AdminTd>
              <AdminTd>
                <AdminPill tone={STATUS_TONE[item.status] ?? "neutral"} mono>
                  {item.status}
                </AdminPill>
              </AdminTd>
              <AdminTd mono>{fmtDate(item.sentAt)}</AdminTd>
              {isEvent ? <AdminTd mono>{fmtDate(item.eventAt)}</AdminTd> : null}
              {isEvent ? (
                <AdminTd mono align="right">
                  {item.eventCount ?? "—"}
                </AdminTd>
              ) : null}
              {detailColumn ? (
                <AdminTd>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: AT.muted,
                      wordBreak: "break-all",
                    }}
                  >
                    {item.eventDetail ?? "—"}
                  </span>
                </AdminTd>
              ) : null}
              {showError ? (
                <AdminTd>
                  <span style={{ fontSize: 11.5, color: AT.muted }}>
                    {item.lastError ?? "—"}
                  </span>
                </AdminTd>
              ) : null}
            </tr>
          ))}
          {data.items.length === 0 ? (
            <tr>
              <AdminTd>
                <span style={{ color: AT.muted }}>
                  Nenhuma entrega neste filtro.
                </span>
              </AdminTd>
            </tr>
          ) : null}
        </tbody>
      </AdminTable>

      <AdminPagination
        summary={`${data.total} destinatário(s) · página ${data.page} de ${totalPages}`}
      >
        {data.page > 1 ? (
          <Link
            href={pageHref(data.page - 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Anterior
          </Link>
        ) : null}
        {data.page < totalPages ? (
          <Link
            href={pageHref(data.page + 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Próxima
          </Link>
        ) : null}
      </AdminPagination>
    </div>
  );
}
