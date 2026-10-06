import Link from "next/link";

import {
  AdminCard,
  AdminPageWrap,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import {
  type EmailTemplateInfo,
  listEmailTemplates,
} from "@/lib/admin-emails-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import {
  MissingTokenState,
  UnexpectedErrorState,
} from "../_components/page-states";
import { TemplateEditor } from "./template-editor";

export const metadata = buildAdminMetadata("Emails — Templates");

const PATH = "/admin/emails/templates";

type SearchParams = Promise<{ key?: string }>;

export default async function AdminEmailsTemplatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { key } = await searchParams;
  const token = await getBackofficeSessionToken();
  if (!token) return <MissingTokenState path={PATH} />;

  let templates: EmailTemplateInfo[];
  try {
    templates = await listEmailTemplates(token);
  } catch {
    return <UnexpectedErrorState path={PATH} />;
  }

  const selected =
    templates.find((template) => template.key === key) ?? templates[0];

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title="Templates"
        subtitle="Assunto e texto dos e-mails de boas-vindas, feedback e confirmação de compra. A edição vale para os próximos envios (inclusive os já agendados). Alerta de Vagas e Product Updates têm o conteúdo editável nas suas próprias abas."
      />

      <div
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}
      >
        {templates.map((template) => {
          const active = template.key === selected?.key;
          return (
            <Link
              key={template.key}
              href={`${PATH}?key=${template.key}`}
              aria-current={active ? "true" : undefined}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 500,
                background: active ? AT.ink : AT.card,
                color: active ? AT.card : AT.ink2,
                border: `1px solid ${active ? AT.ink : AT.border}`,
              }}
            >
              {template.label}
              {template.current.isCustom ? " ●" : ""}
            </Link>
          );
        })}
      </div>

      {selected ? (
        <AdminCard>
          <TemplateEditor key={selected.key} template={selected} />
        </AdminCard>
      ) : null}
    </AdminPageWrap>
  );
}
