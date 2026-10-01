import { AdminPageWrap } from "@/app/admin/_components/admin-primitives";
import { AdminShellHeader } from "@/app/admin/_components/admin-shell-header";
import {
  type EmailDispatchKind,
  type EmailDispatchStatus,
  listEmailDispatches,
} from "@/lib/admin-emails-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { DispatchesSection } from "../_components/dispatches-section";
import {
  MissingTokenState,
  UnexpectedErrorState,
} from "../_components/page-states";

export const metadata = buildAdminMetadata("Emails — Relacionamento");

const PATH = "/admin/emails/relacionamento";
const KINDS: EmailDispatchKind[] = ["WELCOME", "FEEDBACK_FIRST_USE"];
const STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "OUTCOME_UNKNOWN",
  "SKIPPED",
  "CANCELLED",
];

type SearchParams = Promise<{ page?: string; kind?: string; status?: string }>;

export default async function AdminEmailsRelationshipPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { page, kind, status } = await searchParams;
  const token = await getBackofficeSessionToken();
  if (!token) return <MissingTokenState path={PATH} />;

  const parsedPage = page && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const filters = {
    kind: KINDS.includes(kind as EmailDispatchKind)
      ? (kind as EmailDispatchKind)
      : undefined,
    status: STATUSES.includes(status ?? "")
      ? (status as EmailDispatchStatus)
      : undefined,
  };

  let listing: Awaited<ReturnType<typeof listEmailDispatches>>;
  try {
    listing = await listEmailDispatches(
      { page: parsedPage, limit: 25, group: "relationship", ...filters },
      token,
    );
  } catch {
    return <UnexpectedErrorState path={PATH} />;
  }

  return (
    <AdminPageWrap>
      <AdminShellHeader
        eyebrow="Emails"
        title="Relacionamento"
        subtitle="Boas-vindas (~10 min depois do e-mail verificado) e feedback (24h após o cadastro, entre 8h e 20h de Brasília). Descadastro pelo tópico próprio do SES, independente de Product Updates."
      />
      <DispatchesSection
        basePath={PATH}
        kinds={KINDS}
        listing={listing}
        filters={filters}
      />
    </AdminPageWrap>
  );
}
