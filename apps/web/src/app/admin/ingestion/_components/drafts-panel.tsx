"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type { CompanySourceAuditDraft } from "@/lib/admin-ingestion-api";

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function DraftRow({
  draft,
  onChanged,
}: {
  draft: CompanySourceAuditDraft;
  onChanged: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [pending, setPending] = useState<
    "rename" | "activate" | "discard" | null
  >(null);
  const dirty = name.trim() !== draft.name && name.trim().length > 0;
  const resolved = draft.jobCounts.inactive === 0;

  async function handleRename() {
    if (!dirty) return;
    setPending("rename");
    try {
      const res = await fetch(
        `/api/admin/ingestion/company-source-audit/drafts/${draft.id}/rename`,
        {
          body: JSON.stringify({ name: name.trim() }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? "Falha ao renomear.");
        return;
      }
      onChanged();
    } finally {
      setPending(null);
    }
  }

  async function handleActivate() {
    if (
      !window.confirm(
        `Ativar "${draft.name}"? Ela passa a aparecer no radar público e a fonte volta a ser crawleada.`,
      )
    )
      return;
    setPending("activate");
    try {
      const res = await fetch(
        `/api/admin/ingestion/company-source-audit/drafts/${draft.id}/activate`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? "Falha ao ativar.");
        return;
      }
      onChanged();
    } finally {
      setPending(null);
    }
  }

  async function handleDiscard() {
    if (
      !window.confirm(
        `Descartar "${draft.name}"? As ${draft.jobCounts.inactive} vaga(s) pendente(s) viram removed. A empresa continua existindo, só fica marcada como descartada.`,
      )
    )
      return;
    setPending("discard");
    try {
      const res = await fetch(
        `/api/admin/ingestion/company-source-audit/drafts/${draft.id}/discard`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        window.alert(data?.error ?? "Falha ao descartar.");
        return;
      }
      onChanged();
    } finally {
      setPending(null);
    }
  }

  return (
    <tr>
      <AdminTd>
        <input
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
          }}
          style={{
            height: 30,
            borderRadius: 6,
            border: `1px solid ${AT.border}`,
            background: AT.card,
            color: AT.ink2,
            padding: "0 8px",
            fontSize: 12.5,
            width: "100%",
            minWidth: 180,
          }}
          value={name}
        />
      </AdminTd>
      <AdminTd muted>
        {draft.sources.map((source) => (
          <div key={source.id} style={{ wordBreak: "break-all" }}>
            {source.sourceUrl}
          </div>
        ))}
      </AdminTd>
      <AdminTd>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {draft.jobCounts.inactive > 0 && (
            <AdminPill tone="warn" mono>
              {draft.jobCounts.inactive} pendente(s)
            </AdminPill>
          )}
          {draft.jobCounts.active > 0 && (
            <AdminPill tone="ok" mono>
              {draft.jobCounts.active} ativa(s)
            </AdminPill>
          )}
          {draft.jobCounts.removed > 0 && (
            <AdminPill tone="neutral" mono>
              {draft.jobCounts.removed} removida(s)
            </AdminPill>
          )}
          {!resolved ? null : draft.jobCounts.removed > 0 ? (
            <AdminPill tone="neutral">descartado</AdminPill>
          ) : null}
        </div>
      </AdminTd>
      <AdminTd mono muted>
        {dateLabel(draft.createdAt)}
      </AdminTd>
      <AdminTd align="right">
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={!dirty || pending !== null}
            onClick={handleRename}
            type="button"
          >
            {pending === "rename" ? "Salvando..." : "Salvar nome"}
          </button>
          <button
            className={buttonVariants({ size: "sm" })}
            disabled={pending !== null}
            onClick={handleActivate}
            type="button"
          >
            {pending === "activate" ? "Ativando..." : "Ativar"}
          </button>
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            disabled={pending !== null || draft.jobCounts.inactive === 0}
            onClick={handleDiscard}
            type="button"
          >
            {pending === "discard" ? "Descartando..." : "Descartar"}
          </button>
        </div>
      </AdminTd>
    </tr>
  );
}

export function DraftsPanel() {
  const [drafts, setDrafts] = useState<CompanySourceAuditDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/admin/ingestion/company-source-audit/drafts",
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Falha ao carregar rascunhos.");
      setDrafts(await res.json());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar rascunhos.",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <p style={{ color: AT.danger, fontSize: 12.5 }}>{error}</p>;
  }
  if (!drafts) {
    return <p style={{ color: AT.muted, fontSize: 12.5 }}>Carregando...</p>;
  }
  if (drafts.length === 0) {
    return (
      <p style={{ color: AT.muted, fontSize: 12.5 }}>
        Nenhum rascunho — só aparece aqui empresa criada automaticamente pelo
        "Aplicar aprovadas" da auditoria, quando o dono real de um achado ainda
        não existia no nosso banco.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ color: AT.muted, fontSize: 12.5, maxWidth: 720 }}>
        Empresas criadas como rascunho (fora do radar público, fonte pausada)
        quando o "Aplicar aprovadas" não achou dono conhecido pra um achado.
        Renomeie se o nome sugerido não estiver bom, depois <b>Ative</b> pra
        publicar de verdade ou <b>Descarte</b> se não fizer sentido pro radar.
      </p>
      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Nome</AdminTh>
            <AdminTh>URL</AdminTh>
            <AdminTh w={220}>Vagas</AdminTh>
            <AdminTh w={100}>Criado em</AdminTh>
            <AdminTh w={230} align="right">
              Ações
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <DraftRow draft={draft} key={draft.id} onChanged={load} />
          ))}
        </tbody>
      </AdminTable>
    </div>
  );
}
