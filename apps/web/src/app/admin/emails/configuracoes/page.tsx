import {
  AdminCard,
  AdminPageWrap,
  AdminSectionGroup,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import { getEmailSettings } from "@/lib/admin-emails-api";
import { isoToBrtInput } from "@/lib/admin-emails-form";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { fmtDate } from "../_components/email-labels";
import {
  MissingTokenState,
  UnexpectedErrorState,
} from "../_components/page-states";
import { EmailSettingsForm } from "./settings-form";

export const metadata = buildAdminMetadata("Emails — Configurações");

const PATH = "/admin/emails/configuracoes";

export default async function AdminEmailsSettingsPage() {
  const token = await getBackofficeSessionToken();
  if (!token) return <MissingTokenState path={PATH} />;

  let settings: Awaited<ReturnType<typeof getEmailSettings>>;
  try {
    settings = await getEmailSettings(token);
  } catch {
    return <UnexpectedErrorState path={PATH} />;
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title="Configurações"
        subtitle="Modo de ativação de cada tipo de e-mail do dispatch, cutoff e listas — gerenciados aqui, no padrão do Alerta de Vagas e do Product Updates (não por variável de ambiente). Sem configuração salva, tudo fica desligado."
      />

      <AdminSectionGroup label="Ativação">
        <AdminCard>
          <EmailSettingsForm
            initial={{
              welcomeMode: settings.welcomeMode,
              feedbackMode: settings.feedbackMode,
              feedbackSecondCallMode: settings.feedbackSecondCallMode,
              purchaseConfirmationMode: settings.purchaseConfirmationMode,
              mockInterviewOfferMode: settings.mockInterviewOfferMode,
              startAtInput: isoToBrtInput(settings.startAt),
              allowlist: settings.allowlist.join("\n"),
              extraBlocklist: settings.extraBlocklist.join("\n"),
            }}
          />
          <p style={{ fontSize: 12, color: AT.muted, marginTop: 14 }}>
            {settings.updatedAt
              ? `Última alteração: ${fmtDate(settings.updatedAt)}.`
              : "Nunca alterado (tudo desligado)."}{" "}
            A mudança vale em até ~10 segundos em todas as instâncias. Toda
            alteração é registrada no log de ações administrativas.
          </p>
        </AdminCard>
      </AdminSectionGroup>

      <AdminSectionGroup label="O que continua em variável de ambiente">
        <AdminCard>
          <p style={{ fontSize: 13, color: AT.ink2, lineHeight: 1.6 }}>
            Identidade e credenciais do provedor (remetente, Reply-To,
            Configuration Set e tópico de relacionamento do SES, chaves AWS e do
            Resend) seguem no ambiente — são infraestrutura, não decisão de
            produto. O estado de prontidão aparece na{" "}
            <a href="/admin/emails" style={{ textDecoration: "underline" }}>
              Visão geral
            </a>
            .
          </p>
        </AdminCard>
      </AdminSectionGroup>
    </AdminPageWrap>
  );
}
