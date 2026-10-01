import Link from "next/link";

import {
  AdminCard,
  AdminPageWrap,
  AdminPagination,
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { listEmailSuppressions } from "@/lib/admin-emails-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { fmtDate } from "../_components/email-labels";
import {
  MissingTokenState,
  UnexpectedErrorState,
} from "../_components/page-states";

export const metadata = buildAdminMetadata("Emails — Supressões");

const PATH = "/admin/emails/supressoes";

type SearchParams = Promise<{ page?: string }>;

export default async function AdminEmailsSuppressionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { page } = await searchParams;
  const token = await getBackofficeSessionToken();
  if (!token) return <MissingTokenState path={PATH} />;

  const parsedPage = page && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  let listing: Awaited<ReturnType<typeof listEmailSuppressions>>;
  try {
    listing = await listEmailSuppressions(
      { page: parsedPage, limit: 25 },
      token,
    );
  } catch {
    return <UnexpectedErrorState path={PATH} />;
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title="Supressões"
        subtitle="Endereços com hard bounce (permanente) ou complaint, registrados por QUALQUER tipo de e-mail. Nenhum envio — Alerta de Vagas, Product Updates, relacionamento ou compra — vai para eles. Bounce temporário nunca entra aqui; descadastros por tópico são independentes e ficam em cada aba."
      />
      <AdminCard>
        <AdminTable>
          <thead>
            <tr>
              <AdminTh>Endereço</AdminTh>
              <AdminTh>Motivo</AdminTh>
              <AdminTh>Subtipo</AdminTh>
              <AdminTh>Origem</AdminTh>
              <AdminTh>Quando</AdminTh>
            </tr>
          </thead>
          <tbody>
            {listing.items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: 16, fontSize: 13, color: AT.muted2 }}
                >
                  Nenhum endereço suprimido.
                </td>
              </tr>
            ) : (
              listing.items.map((item) => (
                <tr key={item.id}>
                  <AdminTd>{item.email}</AdminTd>
                  <AdminTd>
                    <AdminPill
                      tone={item.reason === "COMPLAINT" ? "danger" : "warn"}
                    >
                      {item.reason === "COMPLAINT"
                        ? "Complaint"
                        : "Hard bounce"}
                    </AdminPill>
                  </AdminTd>
                  <AdminTd>{item.bounceSubType ?? "—"}</AdminTd>
                  <AdminTd>{item.sourceCategory ?? "—"}</AdminTd>
                  <AdminTd>{fmtDate(item.occurredAt)}</AdminTd>
                </tr>
              ))
            )}
          </tbody>
        </AdminTable>
        <AdminPagination
          summary={`${listing.total} endereço${listing.total === 1 ? "" : "s"}`}
        >
          {listing.page > 1 ? (
            <Link href={`${PATH}?page=${listing.page - 1}`}>Anterior</Link>
          ) : null}
          {listing.page * listing.limit < listing.total ? (
            <Link href={`${PATH}?page=${listing.page + 1}`}>Próxima</Link>
          ) : null}
        </AdminPagination>
      </AdminCard>
    </AdminPageWrap>
  );
}
