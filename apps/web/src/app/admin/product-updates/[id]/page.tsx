import Link from "next/link";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminCard,
  AdminPill,
  AdminSectionGroup,
  AdminStatCard,
  AdminStatsRow,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { AdminTokenState } from "@/app/admin/_components/admin-token-state";
import {
  getProductUpdateDetail,
  getProductUpdateEligibleCount,
  type ProductUpdateAudience,
  type ProductUpdateStats,
  previewProductUpdate,
} from "@/lib/admin-product-updates-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import {
  cancelProductUpdateAction,
  markProductUpdateReadyAction,
  sendTestProductUpdateAction,
  startProductUpdateAction,
  updateProductUpdateAction,
} from "../actions";

export const metadata = buildAdminMetadata("Product Updates — campanha");

const EDITABLE_STATUSES = new Set(["DRAFT", "READY"]);

const AUDIENCE_LABEL: Record<ProductUpdateAudience, string> = {
  INTERNAL_TEST: "Time interno (admin/superadmin)",
  ALL_ELIGIBLE_USERS: "Toda a base elegível",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid rgba(10,10,10,0.12)",
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
  };
}

type SearchParams = Promise<{
  status?: string;
  message?: string;
  withName?: string;
  audience?: string;
}>;

export default async function ProductUpdateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { status, message, withName, audience } = await searchParams;
  const token = await getBackofficeSessionToken();
  const rootPath = `/admin/product-updates/${id}`;

  if (!token) {
    const state = buildAdminStateModel("missing-token", rootPath);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let detail: {
    productUpdate: Awaited<
      ReturnType<typeof getProductUpdateDetail>
    >["productUpdate"];
    stats: ProductUpdateStats;
  };
  let preview: { html: string; text: string };
  try {
    [detail, preview] = await Promise.all([
      getProductUpdateDetail(id, token),
      previewProductUpdate(id, { withName: withName === "1" }, token),
    ]);
  } catch {
    const state = buildAdminStateModel("unexpected-error", rootPath);
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { productUpdate, stats } = detail;
  const editable = EDITABLE_STATUSES.has(productUpdate.status);

  const selectedAudience: ProductUpdateAudience | null =
    audience === "INTERNAL_TEST" || audience === "ALL_ELIGIBLE_USERS"
      ? audience
      : null;
  const eligibleCount = selectedAudience
    ? await getProductUpdateEligibleCount(id, selectedAudience, token)
    : null;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
      <AdminShellHeader
        eyebrow="Product Updates"
        title={productUpdate.internalName}
        subtitle={`Status: ${productUpdate.status} · criada em ${fmtDate(productUpdate.createdAt)}`}
        actions={
          <Link href="/admin/product-updates" style={{ fontSize: 12.5 }}>
            ← Todas as campanhas
          </Link>
        }
      />

      {message ? (
        <div
          style={{
            marginBottom: 20,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 12.5,
            background: status === "success" ? AT.okBg : AT.dangerBg,
            color: status === "success" ? AT.ok : AT.danger,
            border: `1px solid ${status === "success" ? "rgba(31,122,77,0.2)" : "rgba(155,44,44,0.2)"}`,
          }}
        >
          {message}
        </div>
      ) : null}

      <AdminSectionGroup label="Editor">
        <AdminCard>
          {!editable ? (
            <p style={{ fontSize: 12.5, color: "#8a8580", marginBottom: 12 }}>
              Campanha em {productUpdate.status} — conteúdo não pode mais ser
              editado.
            </p>
          ) : null}
          <form
            action={updateProductUpdateAction}
            style={{ display: "grid", gap: 10 }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="redirectPath" value={rootPath} />

            <label style={labelStyle()}>
              Assunto
              <input
                type="text"
                name="subject"
                defaultValue={productUpdate.subject}
                disabled={!editable}
                style={inputStyle()}
              />
            </label>

            <label style={labelStyle()}>
              Preheader (texto de prévia)
              <input
                type="text"
                name="preheader"
                defaultValue={productUpdate.preheader ?? ""}
                disabled={!editable}
                style={inputStyle()}
              />
            </label>

            <label style={labelStyle()}>
              Conteúdo
              <textarea
                name="content"
                defaultValue={productUpdate.content}
                disabled={!editable}
                rows={8}
                style={{ ...inputStyle(), resize: "vertical" }}
              />
            </label>

            <label style={labelStyle()}>
              Texto do botão principal (opcional)
              <input
                type="text"
                name="primaryButtonText"
                defaultValue={productUpdate.primaryButtonText ?? ""}
                disabled={!editable}
                style={inputStyle()}
              />
            </label>

            <label style={labelStyle()}>
              URL do botão principal (opcional)
              <input
                type="text"
                name="primaryButtonUrl"
                defaultValue={productUpdate.primaryButtonUrl ?? ""}
                disabled={!editable}
                style={inputStyle()}
              />
            </label>

            <label style={labelStyle()}>
              Rodapé opcional
              <textarea
                name="optionalFooterContent"
                defaultValue={productUpdate.optionalFooterContent ?? ""}
                disabled={!editable}
                rows={2}
                style={{ ...inputStyle(), resize: "vertical" }}
              />
            </label>

            {editable ? (
              <div>
                <button type="submit" className={buttonVariants()}>
                  Salvar rascunho
                </button>
              </div>
            ) : null}
          </form>
        </AdminCard>
      </AdminSectionGroup>

      <AdminSectionGroup label="Preview">
        <AdminCard>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 12,
              fontSize: 12.5,
            }}
          >
            <Link href={`${rootPath}?withName=1`}>Com nome</Link>
            <Link href={rootPath}>Sem nome</Link>
          </div>
          <div
            style={{
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 10,
              padding: 16,
              maxWidth: 520,
              background: "#fff",
            }}
            // Preview do próprio template institucional — nunca HTML
            // arbitrário do admin (o conteúdo em si já passou por
            // escapeHtml em ProductUpdateTemplateService).
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML gerado por ProductUpdateTemplateService, nunca inserido cru do admin
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        </AdminCard>
      </AdminSectionGroup>

      <AdminSectionGroup label="Enviar teste">
        <AdminCard maxWidth={480}>
          <p style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 10 }}>
            Envio de teste usa o template real, mas nunca cria entrega nem entra
            nas métricas da campanha. Obrigatório antes de marcar como pronta.
          </p>
          <form
            action={sendTestProductUpdateAction}
            style={{ display: "flex", gap: 8 }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="redirectPath" value={rootPath} />
            <input
              type="email"
              name="recipientEmail"
              placeholder="seu-email@earlycv.com.br"
              required
              style={inputStyle()}
            />
            <button type="submit" className={buttonVariants()}>
              Enviar teste
            </button>
          </form>
          {productUpdate.testSentAt ? (
            <p style={{ fontSize: 12, color: "#1f7a4d", marginTop: 10 }}>
              Último teste enviado em {fmtDate(productUpdate.testSentAt)} para{" "}
              {productUpdate.testRecipientEmail}.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "#8a8580", marginTop: 10 }}>
              Nenhum teste enviado ainda.
            </p>
          )}
        </AdminCard>
      </AdminSectionGroup>

      {productUpdate.status === "DRAFT" ? (
        <AdminSectionGroup label="Marcar como pronta">
          <AdminCard maxWidth={480}>
            <p style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 10 }}>
              {productUpdate.testSentAt
                ? "Teste já enviado — pode marcar como pronta."
                : "Envie um teste antes de marcar como pronta (obrigatório no backend)."}
            </p>
            <form action={markProductUpdateReadyAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="redirectPath" value={rootPath} />
              <button
                type="submit"
                className={buttonVariants()}
                disabled={!productUpdate.testSentAt}
              >
                Marcar como pronta
              </button>
            </form>
          </AdminCard>
        </AdminSectionGroup>
      ) : null}

      {productUpdate.status === "READY" ? (
        <AdminSectionGroup label="Público e disparo">
          <AdminCard maxWidth={560}>
            <p style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 12 }}>
              Veja a contagem de elegíveis antes de confirmar o disparo — o
              servidor recalcula na hora do envio e recusa se o número mudar.
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <Link
                href={`${rootPath}?audience=INTERNAL_TEST`}
                style={{ fontSize: 12.5 }}
              >
                Ver elegíveis: time interno
              </Link>
              <Link
                href={`${rootPath}?audience=ALL_ELIGIBLE_USERS`}
                style={{ fontSize: 12.5 }}
              >
                Ver elegíveis: toda a base
              </Link>
            </div>

            {selectedAudience && eligibleCount ? (
              <form
                action={startProductUpdateAction}
                style={{ display: "grid", gap: 10 }}
              >
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="redirectPath" value={rootPath} />
                <input type="hidden" name="audience" value={selectedAudience} />
                <input
                  type="hidden"
                  name="confirmedRecipientCount"
                  value={eligibleCount.count}
                />
                <p style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {AUDIENCE_LABEL[selectedAudience]}: {eligibleCount.count}{" "}
                  destinatário{eligibleCount.count === 1 ? "" : "s"}
                </p>
                <div>
                  <button
                    type="submit"
                    className={buttonVariants()}
                    disabled={eligibleCount.count === 0}
                  >
                    Confirmar e iniciar disparo pra {eligibleCount.count}{" "}
                    destinatário{eligibleCount.count === 1 ? "" : "s"}
                  </button>
                </div>
              </form>
            ) : null}
          </AdminCard>
        </AdminSectionGroup>
      ) : null}

      {productUpdate.status === "SENDING" ? (
        <AdminSectionGroup label="Envio em andamento">
          <AdminCard maxWidth={480}>
            <p style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 10 }}>
              Cancelar só afeta entregas ainda pendentes — o que já foi enviado
              não é desfeito.
            </p>
            <form action={cancelProductUpdateAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="redirectPath" value={rootPath} />
              <button
                type="submit"
                className={buttonVariants({ variant: "outline" })}
              >
                Cancelar envio
              </button>
            </form>
          </AdminCard>
        </AdminSectionGroup>
      ) : null}

      <AdminSectionGroup label="Métricas e falhas">
        <AdminStatsRow cols={4}>
          <AdminStatCard label="Enviados" value={String(stats.sent)} />
          <AdminStatCard label="Falhas" value={String(stats.failed)} />
          <AdminStatCard
            label="Indeterminados"
            value={String(stats.outcomeUnknown)}
          />
          <AdminStatCard label="Cancelados" value={String(stats.cancelled)} />
          <AdminStatCard
            label="Aberturas únicas"
            value={String(stats.uniqueOpened)}
          />
          <AdminStatCard
            label="Cliques únicos"
            value={String(stats.uniqueClicked)}
          />
          <AdminStatCard label="Bounces" value={String(stats.bounced)} />
          <AdminStatCard label="Complaints" value={String(stats.complained)} />
        </AdminStatsRow>
      </AdminSectionGroup>

      <div style={{ marginBottom: 12 }}>
        <AdminPill tone="neutral">
          Público: {productUpdate.audience ?? "não definido ainda"}
        </AdminPill>
      </div>
    </div>
  );
}

function labelStyle(): React.CSSProperties {
  return {
    display: "grid",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "#6a6560",
  };
}
