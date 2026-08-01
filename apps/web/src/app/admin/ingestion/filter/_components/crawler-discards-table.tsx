import {
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/app/admin/_components/admin-primitives";
import type { CrawlerDiscardRow } from "@/lib/admin-crawler-discards-api";
import type { FilterActionUiResult } from "../actions";
import { WhitelistDiscardDialog } from "./whitelist-discard-dialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function suggestedTermFor(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function reasonTone(reason: string): "warn" | "neutral" {
  return reason.startsWith("noise_signal:") ? "warn" : "neutral";
}

export function CrawlerDiscardsTable({
  rows,
  whitelistAction,
}: {
  rows: CrawlerDiscardRow[];
  whitelistAction: (
    state: FilterActionUiResult | null,
    formData: FormData,
  ) => Promise<FilterActionUiResult>;
}) {
  return (
    <AdminTable>
      <thead>
        <tr>
          <AdminTh>Titulo</AdminTh>
          <AdminTh w={200}>Empresa/Fonte</AdminTh>
          <AdminTh w={200}>Motivo</AdminTh>
          <AdminTh w={90}>Versao</AdminTh>
          <AdminTh w={160}>Data</AdminTh>
          <AdminTh w={140} align="right">
            Acao
          </AdminTh>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={6}
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "#8a8580",
                fontSize: 13,
              }}
            >
              Nenhum descarte encontrado.
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={row.id}>
            <AdminTd>{row.title}</AdminTd>
            <AdminTd muted>{row.sourceName}</AdminTd>
            <AdminTd>
              <AdminPill mono tone={reasonTone(row.filterReason)}>
                {row.filterReason}
              </AdminPill>
            </AdminTd>
            <AdminTd mono muted>
              {row.filterVersion}
            </AdminTd>
            <AdminTd mono muted>
              {formatDate(row.discardedAt)}
            </AdminTd>
            <AdminTd align="right">
              {row.whitelistedAt ? (
                <AdminPill tone="ok">Whitelisted</AdminPill>
              ) : (
                <WhitelistDiscardDialog
                  discardId={row.id}
                  suggestedTerm={suggestedTermFor(row.title)}
                  title={row.title}
                  whitelistAction={whitelistAction}
                />
              )}
            </AdminTd>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}
