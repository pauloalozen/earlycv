"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPill,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import type { DuplicateJobSourceGroup } from "@/lib/admin-ingestion-api";

async function bulkDelete(ids: string[], removeJobs: boolean) {
  const res = await fetch("/api/admin/ingestion/job-sources/bulk-delete", {
    body: JSON.stringify({ ids, removeJobs }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao excluir fonte(s).");
  return (await res.json()) as { count: number };
}

// Pergunta separada do confirm de exclusão — decisão explícita do usuário
// (ver conversa sobre Job.jobSourceId virar nullable): excluir a fonte
// nunca mais apaga a vaga junto por padrão, só se ele pedir aqui.
function confirmRemoveJobs(jobCount: number) {
  if (jobCount === 0) return false;
  return confirm(
    `Também remover ${jobCount === 1 ? "a vaga" : `as ${jobCount} vagas`} associada(s) a essa fonte? OK = remove as vagas, Cancelar = mantém as vagas (só desvincula da fonte).`,
  );
}

export function DuplicateSourcesPanel() {
  const [groups, setGroups] = useState<DuplicateJobSourceGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qual fonte manter, por sourceUrl do grupo — null = nenhuma selecionada
  // ainda (usuário precisa escolher antes de conseguir apagar o resto).
  const [keepSelection, setKeepSelection] = useState<Record<string, string>>(
    {},
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/ingestion/job-sources/duplicates", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Falha ao buscar fontes duplicadas.");
        const data: DuplicateJobSourceGroup[] = await res.json();
        if (!cancelled) setGroups(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao buscar fontes duplicadas.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function removeFromState(sourceUrl: string, deletedIds: Set<string>) {
    setGroups((prev) => {
      if (!prev) return prev;
      return prev
        .map((group) => {
          if (group.sourceUrl !== sourceUrl) return group;
          const remaining = group.sources.filter((s) => !deletedIds.has(s.id));
          return { ...group, count: remaining.length, sources: remaining };
        })
        .filter((group) => group.count > 1);
    });
    setKeepSelection((prev) => {
      const next = { ...prev };
      delete next[sourceUrl];
      return next;
    });
  }

  async function handleDeleteOne(
    sourceUrl: string,
    id: string,
    label: string,
    jobCount: number,
  ) {
    if (
      !confirm(`Excluir a fonte "${label}"? Essa ação não pode ser desfeita.`)
    )
      return;
    const removeJobs = confirmRemoveJobs(jobCount);
    setPendingId(id);
    try {
      await bulkDelete([id], removeJobs);
      removeFromState(sourceUrl, new Set([id]));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao excluir fonte.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleKeepOnly(group: DuplicateJobSourceGroup) {
    const keepId = keepSelection[group.sourceUrl];
    if (!keepId) return;
    const toDelete = group.sources
      .filter((s) => s.id !== keepId)
      .map((s) => s.id);
    if (toDelete.length === 0) return;

    const keptLabel = group.sources.find((s) => s.id === keepId)?.companyName;
    if (
      !confirm(
        `Manter só "${keptLabel}" e excluir as outras ${toDelete.length} fonte(s) de "${group.sourceUrl}"? Essa ação não pode ser desfeita.`,
      )
    )
      return;

    const jobCountToRemove = group.sources
      .filter((s) => toDelete.includes(s.id))
      .reduce((acc, s) => acc + s.jobCount, 0);
    const removeJobs = confirmRemoveJobs(jobCountToRemove);

    setPendingId(keepId);
    try {
      await bulkDelete(toDelete, removeJobs);
      removeFromState(group.sourceUrl, new Set(toDelete));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao excluir fontes.");
    } finally {
      setPendingId(null);
    }
  }

  if (error) {
    return <p style={{ color: "#b91c1c", fontSize: 12.5 }}>{error}</p>;
  }

  if (!groups) {
    return <p style={{ color: AT.muted, fontSize: 12.5 }}>Carregando...</p>;
  }

  if (groups.length === 0) {
    return (
      <p style={{ color: AT.muted, fontSize: 12.5 }}>
        Nenhuma fonte duplicada encontrada — todo "sourceUrl" está registrado só
        uma vez.
      </p>
    );
  }

  const totalExtra = groups.reduce((acc, g) => acc + (g.count - 1), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ color: AT.muted, fontSize: 12.5 }}>
        {groups.length} URL(s) de origem com mais de uma fonte cadastrada,{" "}
        {totalExtra} linha(s) redundante(s) no total. Marque qual fonte você
        quer manter em cada grupo e clique em "Manter selecionada" pra apagar o
        resto de uma vez — ou exclua individualmente pelo botão da linha.
      </p>

      {groups.map((group) => {
        const keepId = keepSelection[group.sourceUrl];
        return (
          <div
            key={group.sourceUrl}
            style={{
              border: `1px solid ${AT.border}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: AT.faint,
                fontSize: 12.5,
                flexWrap: "wrap",
              }}
            >
              <AdminPill tone="warn">{group.count}x</AdminPill>
              <span style={{ fontFamily: '"Geist Mono", monospace' }}>
                {group.sourceUrl}
              </span>
              <span style={{ color: AT.muted }}>· {group.sourceType}</span>
              <button
                className={buttonVariants({ size: "sm" })}
                disabled={!keepId || pendingId !== null}
                onClick={() => handleKeepOnly(group)}
                style={{ marginLeft: "auto" }}
                type="button"
              >
                Manter selecionada, excluir as outras ({group.count - 1})
              </button>
            </div>

            <AdminTable>
              <thead>
                <tr>
                  <AdminTh w={50}>Manter</AdminTh>
                  <AdminTh>Company</AdminTh>
                  <AdminTh>Fonte</AdminTh>
                  <AdminTh w={90}>Status</AdminTh>
                  <AdminTh w={70} align="right">
                    Vagas
                  </AdminTh>
                  <AdminTh w={110}>Criada em</AdminTh>
                  <AdminTh w={80}>{""}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {group.sources.map((source) => (
                  <tr key={source.id}>
                    <AdminTd>
                      <input
                        checked={keepId === source.id}
                        name={`keep-${group.sourceUrl}`}
                        onChange={() =>
                          setKeepSelection((prev) => ({
                            ...prev,
                            [group.sourceUrl]: source.id,
                          }))
                        }
                        type="radio"
                      />
                    </AdminTd>
                    <AdminTd>{source.companyName}</AdminTd>
                    <AdminTd>{source.sourceName}</AdminTd>
                    <AdminTd>
                      <AdminPill tone={source.isActive ? "ok" : "neutral"}>
                        {source.isActive ? "Ativa" : "Inativa"}
                      </AdminPill>
                    </AdminTd>
                    <AdminTd align="right">{source.jobCount}</AdminTd>
                    <AdminTd>
                      {new Date(source.createdAt).toLocaleDateString("pt-BR")}
                    </AdminTd>
                    <AdminTd align="right">
                      <button
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                        disabled={pendingId !== null}
                        onClick={() =>
                          handleDeleteOne(
                            group.sourceUrl,
                            source.id,
                            `${source.sourceName} (${source.companyName})`,
                            source.jobCount,
                          )
                        }
                        type="button"
                      >
                        Excluir
                      </button>
                    </AdminTd>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </div>
        );
      })}
    </div>
  );
}
