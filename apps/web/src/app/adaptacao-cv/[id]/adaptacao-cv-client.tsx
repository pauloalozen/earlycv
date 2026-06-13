"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { getAtsScoreColors } from "@/app/adaptar/resultado/ats-score-colors";
import { AppHeader } from "@/components/app-header";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import type { DownloadProgressStage } from "@/lib/client-download";
import { downloadFromApi } from "@/lib/client-download";
import type {
  CvAnalysisData,
  CvSection,
  FinalCvOutput,
} from "@/lib/cv-adaptation-api";
import { updateCvAdaptationContent } from "@/lib/cv-adaptation-api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const SIDEBAR_BG = "#111111";
const SIDEBAR_BORDER = "rgba(255,255,255,0.08)";
const CV_BG = "#ffffff";
const PAGE_BG = "#0f0f0f";
const LIME = "#c6ff3a";
const AMBER = "#d4854a";
const AMBER_SOFT = "rgba(212,133,74,0.12)";
const HIGHLIGHT_ACTIVE = "rgba(198,255,58,0.18)";
const HIGHLIGHT_BORDER = "rgba(198,255,58,0.5)";
const SECTION_LABEL_COLOR = "#888";
const CV_DIVIDER = "#e8e8e4";

// ─── Types ────────────────────────────────────────────────────────────────────
type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  adaptationId: string;
  analysisData: CvAnalysisData;
  finalCvOutput: FinalCvOutput | null;
  editedCvJson: FinalCvOutput | null;
  sectionMapping: Record<string, string>;
  jobTitle: string | null;
  companyName: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isLegacyFormat(output: FinalCvOutput | null): boolean {
  if (!output) return true;
  return !(output.sections ?? []).some(
    (s) => s.sectionType && s.sectionType !== "other",
  );
}

function sectionLabel(type: string): string {
  const labels: Record<string, string> = {
    header: "Cabeçalho",
    experience: "Experiência",
    education: "Formação",
    skills: "Habilidades",
    projects: "Projetos",
    certifications: "Certificações",
    languages: "Idiomas",
    other: "Outros",
  };
  return labels[type] ?? type;
}

function scoreLabel(score: number): string {
  if (score <= 44) return "Baixo";
  if (score <= 64) return "Médio";
  if (score <= 84) return "Bom";
  return "Excelente";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({
  score,
  scoreAfter,
}: {
  score: number;
  scoreAfter?: number;
}) {
  const colors = getAtsScoreColors(score);
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 20px 20px",
        borderBottom: `1px solid ${SIDEBAR_BORDER}`,
      }}
    >
      <div style={{ position: "relative", width: 96, height: 96 }}>
        <svg width={96} height={96} viewBox="0 0 96 96" aria-hidden="true">
          <circle
            cx={48}
            cy={48}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={8}
          />
          <circle
            cx={48}
            cy={48}
            r={r}
            fill="none"
            stroke={colors.primary}
            strokeWidth={8}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ / 4}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 26,
              fontWeight: 700,
              color: colors.primary,
              lineHeight: 1,
            }}
          >
            {score}
          </span>
          <span style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
            / 100
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          fontWeight: 600,
          color: colors.primary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {scoreLabel(score)}
      </div>

      {scoreAfter !== undefined && scoreAfter > score && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#555",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>com ajustes</span>
          <span style={{ color: LIME, fontWeight: 700 }}>{scoreAfter}</span>
        </div>
      )}
    </div>
  );
}

function AjusteItem({
  titulo,
  descricao,
  pontos,
  isActive,
  onClick,
}: {
  titulo: string;
  descricao: string;
  pontos: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 16px",
        background: isActive ? "rgba(198,255,58,0.07)" : "transparent",
        borderLeft: `3px solid ${isActive ? LIME : "transparent"}`,
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        cursor: "pointer",
        transition: "background 0.15s, border-left-color 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: isActive ? LIME : "#e0e0e0",
            lineHeight: 1.3,
            transition: "color 0.15s",
          }}
        >
          {titulo}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isActive ? LIME : AMBER,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            marginTop: 1,
          }}
        >
          +{pontos}pts
        </span>
      </div>
      <p style={{ fontSize: 11, color: "#666", lineHeight: 1.4, margin: 0 }}>
        {descricao}
      </p>
    </button>
  );
}

function BulletEditor({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (bullets: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {bullets.map((bullet, idx) => (
        <div
          key={`${idx}-${bullet.slice(0, 16)}`}
          style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
        >
          <span style={{ color: "#999", marginTop: 7, fontSize: 10 }}>•</span>
          <textarea
            value={bullet}
            onChange={(e) => {
              const next = [...bullets];
              next[idx] = e.target.value;
              onChange(next);
            }}
            rows={2}
            style={{
              flex: 1,
              fontSize: 12,
              color: "#111",
              lineHeight: 1.55,
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              padding: "4px 8px",
              resize: "vertical",
              fontFamily: "inherit",
              background: "#fafaf8",
              outline: "none",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function CvSectionBlock({
  section,
  isHighlighted,
  isEditing,
  onBulletsChange,
}: {
  section: CvSection;
  isHighlighted: boolean;
  isEditing: boolean;
  onBulletsChange: (itemIdx: number, bullets: string[]) => void;
}) {
  const isHeader = section.sectionType === "header";

  return (
    <div
      style={{
        marginBottom: 24,
        borderRadius: 8,
        padding: isHeader ? "0" : "12px 16px",
        background: isHighlighted ? HIGHLIGHT_ACTIVE : "transparent",
        border: isHighlighted
          ? `1.5px solid ${HIGHLIGHT_BORDER}`
          : "1.5px solid transparent",
        transition: "background 0.25s, border-color 0.25s",
        scrollMarginTop: 80,
      }}
      data-section-type={section.sectionType}
    >
      {!isHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: SECTION_LABEL_COLOR,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontFamily: "monospace",
            }}
          >
            {sectionLabel(section.sectionType)}
          </span>
          <div style={{ flex: 1, height: 1, background: CV_DIVIDER }} />
        </div>
      )}

      {section.items.map((item, itemIdx) => (
        <div key={item.heading ?? String(itemIdx)} style={{ marginBottom: isHeader ? 0 : 14 }}>
          {isHeader ? (
            <div>
              {item.heading && (
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#0f0f0f",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  {item.heading}
                </div>
              )}
              {item.subheading && (
                <div
                  style={{
                    fontSize: 14,
                    color: "#555",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {item.subheading}
                </div>
              )}
              {item.bullets.length > 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#888",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {item.bullets.join("  ·  ")}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div>
                  {item.heading && (
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#111",
                        lineHeight: 1.3,
                      }}
                    >
                      {item.heading}
                    </div>
                  )}
                  {item.subheading && (
                    <div style={{ fontSize: 12, color: "#555", marginTop: 1 }}>
                      {item.subheading}
                    </div>
                  )}
                </div>
                {item.dateRange && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#999",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                      marginTop: 1,
                    }}
                  >
                    {item.dateRange}
                  </span>
                )}
              </div>

              {isEditing ? (
                <BulletEditor
                  bullets={item.bullets}
                  onChange={(bullets) => onBulletsChange(itemIdx, bullets)}
                />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc" }}>
                  {item.bullets.map((bullet, bIdx) => (
                    <li
                      key={`${bIdx}-${bullet.slice(0, 16)}`}
                      style={{
                        fontSize: 12,
                        color: "#333",
                        lineHeight: 1.55,
                        marginBottom: 3,
                      }}
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LegacyBanner({ texto }: { texto: string }) {
  return (
    <div>
      <div
        style={{
          background: AMBER_SOFT,
          border: `1px solid ${AMBER}`,
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 20,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 16 }} aria-hidden="true">
          ℹ️
        </span>
        <p
          style={{ fontSize: 12, color: "#7a3d10", margin: 0, lineHeight: 1.5 }}
        >
          Esta análise foi gerada em um formato anterior. O destaque por seção
          não está disponível — reanalise seu CV para ter acesso à navegação
          completa.
        </p>
      </div>
      <pre
        style={{
          fontFamily: "inherit",
          fontSize: 13,
          color: "#111",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          margin: 0,
        }}
      >
        {texto}
      </pre>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdaptacaoCvClient({
  adaptationId,
  analysisData,
  finalCvOutput,
  editedCvJson,
  sectionMapping,
  jobTitle,
  companyName,
}: Props) {
  const isLegacy = isLegacyFormat(finalCvOutput);

  const initialSections: CvSection[] = ((editedCvJson ?? finalCvOutput)
    ?.sections ?? []) as CvSection[];

  const [activeAjusteId, setActiveAjusteId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSections, setEditedSections] =
    useState<CvSection[]>(initialSections);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "docx" | null>(
    null,
  );
  const cvPanelRef = useRef<HTMLDivElement>(null);

  const score = analysisData.fit?.score ?? 0;
  const scoreAfter = analysisData.fit?.score_pos_ajustes ?? undefined;
  const ajustes = analysisData.ajustes_conteudo ?? [];
  const highlightedSection = activeAjusteId
    ? (sectionMapping[activeAjusteId] ?? null)
    : null;

  function handleAjusteClick(id: string) {
    const next = id === activeAjusteId ? null : id;
    setActiveAjusteId(next);
    if (next && cvPanelRef.current) {
      const mapped = sectionMapping[id];
      if (mapped) {
        const target = cvPanelRef.current.querySelector(
          `[data-section-type="${mapped}"]`,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function handleBulletsChange(
    sectionIdx: number,
    itemIdx: number,
    bullets: string[],
  ) {
    setEditedSections((prev) =>
      prev.map((s, si) =>
        si !== sectionIdx
          ? s
          : {
              ...s,
              items: s.items.map((it, ii) =>
                ii !== itemIdx ? it : { ...it, bullets },
              ),
            },
      ),
    );
  }

  async function handleSave() {
    setSaveStatus("saving");
    try {
      await updateCvAdaptationContent(adaptationId, editedSections);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  function cancelEditing() {
    setEditedSections(initialSections);
    setIsEditing(false);
    setSaveStatus("idle");
  }

  async function handleDownload(format: "pdf" | "docx") {
    setDownloadFormat(format);
    setDownloadOpen(true);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${adaptationId}/download?format=${format}`,
        fallbackFilename: `cv-adaptado.${format}`,
        onStageChange: setDownloadStage,
      });
    } finally {
      setDownloadOpen(false);
      setDownloadStage(null);
      setDownloadFormat(null);
    }
  }

  const displaySections = isEditing ? editedSections : initialSections;

  return (
    <PageShell>
      <AppHeader />

      <DownloadProgressOverlay
        open={downloadOpen}
        stage={downloadStage}
        format={downloadFormat}
      />

      <div
        style={{
          display: "flex",
          minHeight: "100dvh",
          background: PAGE_BG,
          paddingTop: 64,
        }}
      >
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            background: SIDEBAR_BG,
            borderRight: `1px solid ${SIDEBAR_BORDER}`,
            display: "flex",
            flexDirection: "column",
            position: "sticky",
            top: 64,
            height: "calc(100dvh - 64px)",
            overflowY: "auto",
          }}
        >
          {/* Header with back link and job info */}
          <div
            style={{
              padding: "16px 16px 14px",
              borderBottom: `1px solid ${SIDEBAR_BORDER}`,
            }}
          >
            <Link
              href={`/adaptar/resultado?adaptationId=${adaptationId}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "#555",
                textDecoration: "none",
                marginBottom: 10,
              }}
            >
              ← Voltar à análise
            </Link>
            {(jobTitle || companyName) && (
              <div>
                {jobTitle && (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#e0e0e0",
                      lineHeight: 1.3,
                    }}
                  >
                    {jobTitle}
                  </div>
                )}
                {companyName && (
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                    {companyName}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Score ring */}
          <ScoreRing score={score} scoreAfter={scoreAfter} />

          {/* Improvements list */}
          {ajustes.length > 0 && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div
                style={{
                  padding: "10px 16px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#444",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Melhorias aplicadas
              </div>
              {ajustes.map((ajuste) => {
                const itemId = ajuste.id ?? ajuste.titulo;
                return (
                  <AjusteItem
                    key={itemId}
                    titulo={ajuste.titulo}
                    descricao={ajuste.descricao}
                    pontos={ajuste.pontos}
                    isActive={activeAjusteId === itemId}
                    onClick={() => handleAjusteClick(itemId)}
                  />
                );
              })}
            </div>
          )}

          {/* Download buttons */}
          <div
            style={{
              padding: "14px 16px",
              borderTop: `1px solid ${SIDEBAR_BORDER}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => handleDownload("pdf")}
              style={{
                width: "100%",
                padding: "10px 0",
                background: LIME,
                color: "#0a0a0a",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              ↓ Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => handleDownload("docx")}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "transparent",
                color: "#aaa",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ↓ Baixar DOCX
            </button>
          </div>
        </aside>

        {/* ── CV Panel ────────────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
          {/* Edit toolbar */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEditing}
                  style={{
                    padding: "7px 16px",
                    background: "transparent",
                    color: "#888",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  style={{
                    padding: "7px 20px",
                    background: saveStatus === "saved" ? "#22c55e" : LIME,
                    color: "#0a0a0a",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: saveStatus === "saving" ? "default" : "pointer",
                    opacity: saveStatus === "saving" ? 0.7 : 1,
                    transition: "background 0.2s",
                  }}
                >
                  {saveStatus === "saving"
                    ? "Salvando..."
                    : saveStatus === "saved"
                      ? "✓ Salvo"
                      : saveStatus === "error"
                        ? "Erro ao salvar"
                        : "Salvar"}
                </button>
              </>
            ) : (
              !isLegacy && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: "7px 20px",
                    background: "rgba(255,255,255,0.05)",
                    color: "#ccc",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ✏ Editar CV
                </button>
              )
            )}
          </div>

          {/* CV card */}
          <div
            ref={cvPanelRef}
            style={{
              background: CV_BG,
              borderRadius: 14,
              padding: "40px 48px",
              maxWidth: 760,
              margin: "0 auto",
              boxShadow: "0 4px 40px rgba(0,0,0,0.5)",
              minHeight: 600,
            }}
          >
            {isLegacy ? (
              <LegacyBanner texto={analysisData.comparacao?.depois ?? ""} />
            ) : (
              displaySections.map((section, sectionIdx) => (
                <CvSectionBlock
                  key={section.sectionType}
                  section={section}
                  isHighlighted={
                    !isEditing && highlightedSection === section.sectionType
                  }
                  isEditing={isEditing && section.sectionType !== "header"}
                  onBulletsChange={(itemIdx, bullets) =>
                    handleBulletsChange(sectionIdx, itemIdx, bullets)
                  }
                />
              ))
            )}
          </div>
        </main>
      </div>
    </PageShell>
  );
}
