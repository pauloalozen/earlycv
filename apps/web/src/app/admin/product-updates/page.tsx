import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminCard,
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import {
  listProductUpdates,
  type ProductUpdate,
  type ProductUpdateAudience,
  type ProductUpdateStatus,
} from "@/lib/admin-product-updates-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { createProductUpdateAction } from "./actions";

export const metadata = buildAdminMetadata("Product Updates");

const ROOT_PATH = "/admin/product-updates";

const STATUS_TONE: Record<
  ProductUpdateStatus,
  "ok" | "danger" | "warn" | "info" | "neutral"
> = {
  DRAFT: "neutral",
  READY: "info",
  SENDING: "warn",
  COMPLETED: "ok",
  CANCELLED: "neutral",
  FAILED: "danger",
};

const STATUS_LABEL: Record<ProductUpdateStatus, string> = {
  DRAFT: "Rascunho",
  READY: "Pronta",
  SENDING: "Enviando",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  FAILED: "Falhou",
};

// Nomes internos (INTERNAL_TEST/ALL_ELIGIBLE_USERS) nunca aparecem na
// interface — histórico mostra só estes rótulos curtos.
const AUDIENCE_LABEL: Record<ProductUpdateAudience, string> = {
  INTERNAL_TEST: "Internos",
  PAID: "Pagantes",
  ALL_ELIGIBLE_USERS: "Toda a base",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

type SearchParams = Promise<{ page?: string }>;

export default async function AdminProductUpdatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { page } = await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const parsedPage = page && Number(page) > 0 ? Math.floor(Number(page)) : 1;

  let listing: {
    items: ProductUpdate[];
    total: number;
    page: number;
    limit: number;
  };
  try {
    listing = await listProductUpdates({ page: parsedPage, limit: 20 }, token);
  } catch {
    const state = buildAdminStateModel("unexpected-error", ROOT_PATH);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Comunicação"
        title="Product Updates"
        subtitle="Comunicados institucionais da EarlyCV — assunto, texto e botão, dentro do template institucional. Descadastro é feito inteiramente pelo SES (gerenciamento nativo de lista), independente do Alerta de Vagas."
      />

      <AdminCard>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 14,
            color: "#0a0a0a",
          }}
        >
          Nova campanha
        </h2>
        <form
          action={createProductUpdateAction}
          style={{ display: "grid", gap: 10, maxWidth: 640 }}
        >
          <input
            type="text"
            name="internalName"
            placeholder="Nome interno (só pra identificar no admin)"
            required
            style={inputStyle}
          />
          <input
            type="text"
            name="subject"
            placeholder="Assunto do e-mail"
            required
            style={inputStyle}
          />
          <textarea
            name="content"
            placeholder="Conteúdo (parágrafos separados por linha em branco; para link use [texto](https://...))"
            required
            rows={4}
            style={{ ...inputStyle, resize: "vertical" as const }}
          />
          <div>
            <button type="submit" className={buttonVariants()}>
              Criar rascunho
            </button>
          </div>
        </form>
      </AdminCard>

      <AdminCard>
        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Nome interno</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Público</AdminTh>
              <AdminTh align="right">Destinatários</AdminTh>
              <AdminTh>Criada em</AdminTh>
              <AdminTh w={80}>{null}</AdminTh>
            </tr>
          </thead>
          <tbody>
            {listing.items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: "16px", fontSize: 13, color: "#8a8580" }}
                >
                  Nenhuma campanha criada ainda.
                </td>
              </tr>
            ) : (
              listing.items.map((item) => (
                <tr key={item.id}>
                  <AdminTd>{item.internalName}</AdminTd>
                  <AdminTd>
                    <AdminPill tone={STATUS_TONE[item.status]}>
                      {STATUS_LABEL[item.status]}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd>
                    {item.audience ? AUDIENCE_LABEL[item.audience] : "—"}
                  </AdminTd>
                  <AdminTd align="right">{item.recipientCount}</AdminTd>
                  <AdminTd>{fmtDate(item.createdAt)}</AdminTd>
                  <AdminTd>
                    <Link
                      href={`${ROOT_PATH}/${item.id}`}
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
          summary={`${listing.total} campanha${listing.total === 1 ? "" : "s"}`}
        >
          {listing.page > 1 ? (
            <Link href={`${ROOT_PATH}?page=${listing.page - 1}`}>Anterior</Link>
          ) : null}
          {listing.page * listing.limit < listing.total ? (
            <Link href={`${ROOT_PATH}?page=${listing.page + 1}`}>Próxima</Link>
          ) : null}
        </AdminPagination>
      </AdminCard>
    </AdminPageWrap>
  );
}

const inputStyle = {
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid rgba(10,10,10,0.12)",
  fontSize: 13,
  fontFamily: "inherit",
};
