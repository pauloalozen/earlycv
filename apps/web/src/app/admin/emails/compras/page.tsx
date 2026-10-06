import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminCard,
  AdminPageWrap,
  AdminSectionGroup,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import {
  type EmailDispatchStatus,
  getMissingPurchaseConfirmations,
  listEmailDispatches,
} from "@/lib/admin-emails-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { DispatchesSection } from "../_components/dispatches-section";
import { fmtDate } from "../_components/email-labels";
import {
  MissingTokenState,
  UnexpectedErrorState,
} from "../_components/page-states";
import { recoverPurchaseConfirmationsAction } from "../actions";

export const metadata = buildAdminMetadata("Emails — Compras");

const PATH = "/admin/emails/compras";
const STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "OUTCOME_UNKNOWN",
  "SKIPPED",
  "CANCELLED",
];

type SearchParams = Promise<{
  page?: string;
  status?: string;
  message?: string;
}>;

export default async function AdminEmailsPurchasesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { page, status, message } = await searchParams;
  const token = await getBackofficeSessionToken();
  if (!token) return <MissingTokenState path={PATH} />;

  const parsedPage = page && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const filters = {
    status: STATUSES.includes(status ?? "")
      ? (status as EmailDispatchStatus)
      : undefined,
  };

  let listing: Awaited<ReturnType<typeof listEmailDispatches>>;
  let missing: Awaited<ReturnType<typeof getMissingPurchaseConfirmations>>;
  try {
    [listing, missing] = await Promise.all([
      listEmailDispatches(
        { page: parsedPage, limit: 25, group: "purchase", ...filters },
        token,
      ),
      getMissingPurchaseConfirmations(24, token),
    ]);
  } catch {
    return <UnexpectedErrorState path={PATH} />;
  }

  // status/message vêm do redirect da action de recuperação (status =
  // "error"|"success", que não colide com os valores do filtro de status).
  const feedback = message ? { ok: status !== "error", text: message } : null;

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title="Confirmação de compra"
        subtitle="Recibo enviado quando uma compra é aprovada (inclusive resgate de cupom 100%, que nunca alega pagamento). Transacional: sem descadastro. Créditos e aprovação nunca dependem deste e-mail."
      />

      {feedback ? (
        <div
          style={{
            marginBottom: 20,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 12.5,
            background: feedback.ok ? AT.okBg : AT.dangerBg,
            color: feedback.ok ? AT.ok : AT.danger,
          }}
        >
          {feedback.text}
        </div>
      ) : null}

      <AdminSectionGroup label="Compras sem confirmação (últimas 24h)">
        <AdminCard>
          {missing.count === 0 ? (
            <p style={{ fontSize: 13, color: AT.muted }}>
              Nenhuma compra concluída nas últimas {missing.sinceHours}h está
              sem confirmação.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                {missing.count} compra(s) concluída(s) sem linha de confirmação
                (o enfileiramento falhou, ou o modo estava desligado). Créditos
                já foram aplicados. Recriar é seguro (idempotente) e o envio
                segue o modo atual.
              </p>
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTh>Compra</AdminTh>
                    <AdminTh>Plano</AdminTh>
                    <AdminTh>Concluída</AdminTh>
                  </tr>
                </thead>
                <tbody>
                  {missing.items.slice(0, 20).map((item) => (
                    <tr key={item.purchaseId}>
                      <AdminTd>{item.purchaseId}</AdminTd>
                      <AdminTd>{item.planType}</AdminTd>
                      <AdminTd>{fmtDate(item.completedAt)}</AdminTd>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
              <form
                action={recoverPurchaseConfirmationsAction}
                style={{ marginTop: 12 }}
              >
                <input
                  type="hidden"
                  name="sinceHours"
                  value={missing.sinceHours}
                />
                <button type="submit" className={buttonVariants()}>
                  Recriar confirmações faltantes
                </button>
              </form>
            </>
          )}
        </AdminCard>
      </AdminSectionGroup>

      <AdminSectionGroup label="Envios">
        <DispatchesSection
          basePath={PATH}
          kinds={["PURCHASE_CONFIRMATION"]}
          listing={listing}
          filters={filters}
        />
      </AdminSectionGroup>
    </AdminPageWrap>
  );
}
