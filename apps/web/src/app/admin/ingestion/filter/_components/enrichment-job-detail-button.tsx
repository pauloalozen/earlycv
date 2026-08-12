"use client";

import { useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";

type EnrichmentJobDetail = {
  areas: string[];
  attempts: number;
  careerFingerprint: string[];
  certifications: string[];
  companyName: string;
  contractType: string | null;
  dominantArea: string | null;
  enrichedAt: string | null;
  enrichmentError: string | null;
  enrichmentModel: string | null;
  enrichmentStatus: string;
  enrichmentVersion: string | null;
  experienceYearsMin: number | null;
  id: string;
  jobTitle: string;
  languageRequirements: string[];
  managementRequired: boolean;
  optionalSkills: string[];
  requiredSkills: string[];
  semanticFilterReason: string | null;
  semanticFilterResult: string;
  semanticFilterVersion: string | null;
  seniority: string | null;
  sourceJobUrl: string;
  specialties: string[];
  technologies: string[];
  travelRequired: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 10,
          letterSpacing: 1,
          color: AT.muted2,
          fontWeight: 500,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: AT.ink2, marginTop: 2 }}>
        {value || "—"}
      </div>
    </div>
  );
}

export function EnrichmentJobDetailButton({
  jobEnrichmentId,
}: {
  jobEnrichmentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnrichmentJobDetail | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/ingestion/enrichment/jobs/${jobEnrichmentId}`,
      );
      if (!res.ok) {
        setError("Falha ao carregar os dados do enriquecimento.");
        return;
      }
      setDetail(await res.json());
    } catch {
      setError("Falha ao carregar os dados do enriquecimento.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setDetail(null);
    setError(null);
  }

  return (
    <>
      <button
        className={buttonVariants({ size: "sm", variant: "outline" })}
        onClick={handleOpen}
        type="button"
      >
        Ver dados
      </button>

      {open && (
        // biome-ignore lint/a11y/useSemanticElements: backdrop precisa envolver o modal (que tem seu proprio <button>), nao pode virar <button>
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) handleClose();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") handleClose();
          }}
          role="button"
          style={{
            alignItems: "center",
            background: "rgba(10,10,10,0.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            position: "fixed",
            zIndex: 60,
          }}
          tabIndex={-1}
        >
          <div
            style={{
              background: AT.card,
              borderRadius: 12,
              maxHeight: "85vh",
              maxWidth: 560,
              overflowY: "auto",
              padding: 24,
              width: "90%",
            }}
          >
            <div
              style={{
                alignItems: "flex-start",
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: AT.ink }}>
                  {detail?.jobTitle ?? "Carregando..."}
                </h3>
                {detail && (
                  <p style={{ fontSize: 12, color: AT.muted, marginTop: 2 }}>
                    {detail.companyName}
                  </p>
                )}
              </div>
              <button
                className={buttonVariants({ size: "sm", variant: "outline" })}
                onClick={handleClose}
                type="button"
              >
                Fechar
              </button>
            </div>

            {loading && (
              <p style={{ fontSize: 13, color: AT.muted }}>Carregando...</p>
            )}
            {error && <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>}

            {detail && !loading && !error && (
              <div>
                <Field label="Status" value={detail.enrichmentStatus} />
                <Field
                  label="Filtro semantico"
                  value={`${detail.semanticFilterResult}${
                    detail.semanticFilterReason
                      ? ` — ${detail.semanticFilterReason}`
                      : ""
                  }`}
                />
                <Field label="Area dominante" value={detail.dominantArea} />
                <Field label="Areas" value={detail.areas.join(", ") || null} />
                <Field
                  label="Especialidades"
                  value={detail.specialties.join(", ") || null}
                />
                <Field label="Senioridade" value={detail.seniority} />
                <Field
                  label="Skills obrigatorias"
                  value={detail.requiredSkills.join(", ") || null}
                />
                <Field
                  label="Skills opcionais"
                  value={detail.optionalSkills.join(", ") || null}
                />
                <Field
                  label="Tecnologias"
                  value={detail.technologies.join(", ") || null}
                />
                <Field label="Tipo de contrato" value={detail.contractType} />
                <Field
                  label="Idiomas"
                  value={detail.languageRequirements.join(", ") || null}
                />
                <Field
                  label="Certificacoes"
                  value={detail.certifications.join(", ") || null}
                />
                <Field
                  label="Anos de experiencia (min)"
                  value={detail.experienceYearsMin}
                />
                <Field
                  label="Gestao / Viagem"
                  value={`${detail.managementRequired ? "gestao" : "sem gestao"} / ${
                    detail.travelRequired ? "viagem" : "sem viagem"
                  }`}
                />
                <Field
                  label="Career fingerprint"
                  value={detail.careerFingerprint.join(", ") || null}
                />
                <Field
                  label="Modelo / versao"
                  value={`${detail.enrichmentModel ?? "—"} / ${
                    detail.enrichmentVersion ?? "—"
                  }`}
                />
                <Field
                  label="Enriquecido em"
                  value={formatDate(detail.enrichedAt)}
                />
                {detail.enrichmentError && (
                  <Field label="Erro" value={detail.enrichmentError} />
                )}
                <a
                  href={detail.sourceJobUrl}
                  rel="noreferrer"
                  style={{
                    color: AT.ink,
                    fontSize: 12,
                    textDecoration: "underline",
                  }}
                  target="_blank"
                >
                  Ver vaga original
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
