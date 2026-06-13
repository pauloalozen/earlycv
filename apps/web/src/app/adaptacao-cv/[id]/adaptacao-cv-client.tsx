"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
const SIDEBAR_W = 288;
const HEADER_H = 60;
const SIDEBAR_BG = "#111";
const SIDEBAR_BORDER = "rgba(255,255,255,0.07)";
const PAGE_BG = "#0a0a0a";
const CV_BG = "#ffffff";
const LIME = "#c6ff3a";
const AMBER = "#d4854a";
const AMBER_SOFT = "rgba(212,133,74,0.1)";
const AMBER_BORDER = "rgba(212,133,74,0.35)";
const HIGHLIGHT_BG = "rgba(198,255,58,0.10)";
const HIGHLIGHT_BORDER = "rgba(198,255,58,0.45)";
const CV_DIVIDER = "#e5e5e1";
const CV_META = "#999";
const CV_SECONDARY = "#555";
const SECTION_COLORS: Record<string, string> = {
  experience: "#5da0e8",
  skills: LIME,
  education: "#a78bfa",
  header: "#f0f0f0",
  projects: "#34d399",
  certifications: "#f59e0b",
  languages: "#fb7185",
  other: "#9ca3af",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type SaveStatus = "idle" | "saving" | "saved" | "error";

type AjusteWithKey = {
  key: string;
  titulo: string;
  descricao: string;
  pontos: number;
  dica?: string;
};

type SectionGroup = {
  sectionType: string;
  label: string;
  color: string;
  ajustes: AjusteWithKey[];
};

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
function hasSections(output: FinalCvOutput | null): boolean {
  return (output?.sections ?? []).some(
    (s) => s.sectionType && s.sectionType !== "other",
  );
}

function sectionLabel(type: string): string {
  const labels: Record<string, string> = {
    header: "Dados Pessoais",
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
  if (score <= 44) return "baixo";
  if (score <= 64) return "médio";
  if (score <= 84) return "bom";
  return "excelente";
}

function buildSectionGroups(
  ajustes: CvAnalysisData["ajustes_conteudo"],
  sectionMapping: Record<string, string>,
): SectionGroup[] {
  if (!ajustes?.length) return [];

  const groupMap = new Map<string, SectionGroup>();
  for (const a of ajustes) {
    const key = a.id ?? a.titulo;
    if (!key) continue;
    const type = sectionMapping[key] ?? "experience";
    if (!groupMap.has(type)) {
      groupMap.set(type, {
        sectionType: type,
        label: sectionLabel(type),
        color: SECTION_COLORS[type] ?? "#aaa",
        ajustes: [],
      });
    }
    const group = groupMap.get(type);
    if (!group) continue;
    group.ajustes.push({
      key,
      titulo: a.titulo,
      descricao: a.descricao,
      pontos: a.pontos,
      dica: a.dica,
    });
  }
  return Array.from(groupMap.values());
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
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = Math.min((score / 100) * circ, circ);

  return (
    <div
      style={{
        padding: "22px 16px 18px",
        borderBottom: `1px solid ${SIDEBAR_BORDER}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ position: "relative", width: 100, height: 100 }}>
        <svg width={100} height={100} viewBox="0 0 100 100" aria-hidden="true">
          <circle
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={7}
          />
          <circle
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke={colors.primary}
            strokeWidth={7}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ / 4}
            strokeLinecap="round"
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
            gap: 0,
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 30,
              fontWeight: 800,
              color: colors.primary,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {score}
          </span>
          <span
            style={{
              fontSize: 9,
              color: "#555",
              marginTop: 1,
              letterSpacing: "0.06em",
            }}
          >
            / 100
          </span>
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: colors.primary,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          ATS {scoreLabel(score)}
        </div>
        {scoreAfter !== undefined && scoreAfter > score && (
          <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
            após ajustes:{" "}
            <span style={{ color: LIME, fontWeight: 700 }}>
              {scoreAfter} pts
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionGroupBlock({
  group,
  activeKey,
  onSelect,
}: {
  group: SectionGroup;
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const totalPts = group.ajustes.reduce((s, a) => s + a.pontos, 0);

  return (
    <div style={{ borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
      {/* Section header */}
      <div
        style={{
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: group.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: group.color,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            flex: 1,
          }}
        >
          {group.label}
        </span>
        <span
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "#555",
          }}
        >
          +{totalPts}pts
        </span>
      </div>

      {/* Ajuste items */}
      {group.ajustes.map((a) => {
        const isActive = activeKey === a.key;
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => onSelect(a.key)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "9px 16px 9px 26px",
              background: isActive ? "rgba(198,255,58,0.06)" : "transparent",
              borderLeft: `2px solid ${isActive ? LIME : "transparent"}`,
              borderTop: "none",
              borderRight: "none",
              borderBottom: "none",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isActive ? "#fff" : "#c8c8c8",
                  lineHeight: 1.3,
                  flex: 1,
                  transition: "color 0.12s",
                }}
              >
                {a.titulo}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: isActive ? LIME : AMBER,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  marginTop: 1,
                }}
              >
                +{a.pontos}
              </span>
            </div>
            <p
              style={{
                fontSize: 10,
                color: "#555",
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {a.descricao}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function HeaderSectionView({
  section,
  isHighlighted,
  isEditing,
  onItemChange,
}: {
  section: CvSection;
  isHighlighted: boolean;
  isEditing: boolean;
  onItemChange: (
    itemIdx: number,
    field: "heading" | "subheading" | "bullets",
    value: string | string[],
  ) => void;
}) {
  const item = section.items[0];
  if (!item) return null;

  return (
    <div
      data-section-type="header"
      style={{
        marginBottom: 28,
        paddingBottom: 20,
        borderBottom: `1px solid ${CV_DIVIDER}`,
        borderRadius: 6,
        padding: isHighlighted ? "12px 14px" : "0",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        border: isHighlighted
          ? `1.5px solid ${HIGHLIGHT_BORDER}`
          : "1.5px solid transparent",
        transition: "background 0.2s, border-color 0.2s",
        scrollMarginTop: 16,
      }}
    >
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label
              htmlFor="hdr-heading"
              style={{
                fontSize: 9,
                color: CV_META,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 3,
              }}
            >
              Nome
            </label>
            <input
              id="hdr-heading"
              type="text"
              value={item.heading ?? ""}
              onChange={(e) => onItemChange(0, "heading", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label
              htmlFor="hdr-subheading"
              style={{
                fontSize: 9,
                color: CV_META,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 3,
              }}
            >
              Cargo / Título
            </label>
            <input
              id="hdr-subheading"
              type="text"
              value={item.subheading ?? ""}
              onChange={(e) => onItemChange(0, "subheading", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label
              htmlFor="hdr-contact"
              style={{
                fontSize: 9,
                color: CV_META,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 3,
              }}
            >
              Contato (separado por · )
            </label>
            <input
              id="hdr-contact"
              type="text"
              value={item.bullets.join(" · ")}
              onChange={(e) =>
                onItemChange(
                  0,
                  "bullets",
                  e.target.value
                    .split("·")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              style={inputStyle}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: `1px solid ${CV_DIVIDER}`,
          }}
        >
          {item.heading && (
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0d0d0d",
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
              }}
            >
              {item.heading}
            </div>
          )}
          {item.subheading && (
            <div
              style={{
                fontSize: 13,
                color: CV_SECONDARY,
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
                fontSize: 11,
                color: CV_META,
                marginTop: 6,
                lineHeight: 1.6,
                display: "flex",
                flexWrap: "wrap",
                gap: "2px 8px",
              }}
            >
              {item.bullets.map((b, i) => (
                <span key={b}>
                  {i > 0 && (
                    <span style={{ marginRight: 8, opacity: 0.4 }}>·</span>
                  )}
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  color: "#111",
  border: "1px solid #ddd",
  borderRadius: 4,
  padding: "5px 8px",
  fontFamily: "inherit",
  background: "#fafaf8",
  outline: "none",
  boxSizing: "border-box",
};

function CvSectionBlock({
  section,
  isHighlighted,
  isEditing,
  onBulletsChange,
  onItemChange,
}: {
  section: CvSection;
  isHighlighted: boolean;
  isEditing: boolean;
  onBulletsChange: (itemIdx: number, bullets: string[]) => void;
  onItemChange: (
    itemIdx: number,
    field: "heading" | "subheading" | "dateRange",
    value: string,
  ) => void;
}) {
  const color = SECTION_COLORS[section.sectionType] ?? "#aaa";

  return (
    <div
      data-section-type={section.sectionType}
      style={{
        marginBottom: 22,
        borderRadius: 8,
        padding: "14px 16px",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        border: isHighlighted
          ? `1.5px solid ${HIGHLIGHT_BORDER}`
          : "1.5px solid transparent",
        transition: "background 0.2s, border-color 0.2s",
        scrollMarginTop: 16,
      }}
    >
      {/* Section header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          {sectionLabel(section.sectionType)}
        </span>
        <div style={{ flex: 1, height: 1, background: CV_DIVIDER }} />
      </div>

      {/* Items */}
      {section.items.map((item, itemIdx) => (
        <div key={item.heading ?? String(itemIdx)} style={{ marginBottom: 14 }}>
          {/* Item header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <div style={{ flex: 1 }}>
              {isEditing ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <input
                    type="text"
                    placeholder="Título / Cargo / Competência"
                    value={item.heading ?? ""}
                    onChange={(e) =>
                      onItemChange(itemIdx, "heading", e.target.value)
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Subtítulo / Empresa / Nível"
                    value={item.subheading ?? ""}
                    onChange={(e) =>
                      onItemChange(itemIdx, "subheading", e.target.value)
                    }
                    style={inputStyle}
                  />
                </div>
              ) : (
                <>
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
                    <div
                      style={{
                        fontSize: 11,
                        color: CV_SECONDARY,
                        marginTop: 1,
                      }}
                    >
                      {item.subheading}
                    </div>
                  )}
                </>
              )}
            </div>
            {isEditing ? (
              <input
                type="text"
                placeholder="Período"
                value={item.dateRange ?? ""}
                onChange={(e) =>
                  onItemChange(itemIdx, "dateRange", e.target.value)
                }
                style={{ ...inputStyle, width: 110, flexShrink: 0 }}
              />
            ) : (
              item.dateRange && (
                <span
                  style={{
                    fontSize: 10,
                    color: CV_META,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    marginTop: 1,
                  }}
                >
                  {item.dateRange}
                </span>
              )
            )}
          </div>

          {/* Bullets */}
          {isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {item.bullets.map((bullet, bIdx) => (
                <div
                  key={`edit-${itemIdx}-${bIdx}`}
                  style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
                >
                  <span
                    style={{
                      color: CV_META,
                      marginTop: 6,
                      fontSize: 9,
                      flexShrink: 0,
                    }}
                  >
                    •
                  </span>
                  <textarea
                    value={bullet}
                    rows={2}
                    onChange={(e) => {
                      const next = [...item.bullets];
                      next[bIdx] = e.target.value;
                      onBulletsChange(itemIdx, next);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      color: "#111",
                      lineHeight: 1.5,
                      border: "1px solid #ddd",
                      borderRadius: 4,
                      padding: "4px 8px",
                      resize: "none",
                      fontFamily: "inherit",
                      background: "#fafaf8",
                      outline: "none",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            item.bullets.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 14, listStyle: "disc" }}>
                {item.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    style={{
                      fontSize: 11,
                      color: "#333",
                      lineHeight: 1.6,
                      marginBottom: 2,
                    }}
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function GeneratingState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 40,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: `3px solid rgba(198,255,58,0.15)`,
          borderTop: `3px solid ${LIME}`,
          animation: "spin 0.9s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
          Finalizando seu CV adaptado...
        </div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
          Aguarde, estamos montando a versão final
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdaptacaoCvClient({
  adaptationId,
  analysisData,
  finalCvOutput: initialFinalCvOutput,
  editedCvJson,
  sectionMapping: initialSectionMapping,
  jobTitle,
  companyName,
}: Props) {
  const [finalCvOutput, setFinalCvOutput] = useState(initialFinalCvOutput);
  const [sectionMapping, setSectionMapping] = useState(initialSectionMapping);
  const [isGenerating, setIsGenerating] = useState(
    !hasSections(editedCvJson ?? initialFinalCvOutput),
  );

  const initialSections = ((editedCvJson ?? finalCvOutput)?.sections ??
    []) as CvSection[];
  const [activeAjusteKey, setActiveAjusteKey] = useState<string | null>(null);
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
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll until finalCvOutput has real sections
  const pollContent = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv-adaptation/${adaptationId}/content`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        finalCvOutput?: { sections?: unknown[] } | null;
        sectionMapping?: Record<string, string>;
      };
      if (
        payload.finalCvOutput &&
        Array.isArray(payload.finalCvOutput.sections) &&
        payload.finalCvOutput.sections.length > 0
      ) {
        setFinalCvOutput(payload.finalCvOutput as FinalCvOutput);
        if (payload.sectionMapping) setSectionMapping(payload.sectionMapping);
        setEditedSections(
          (payload.finalCvOutput.sections ?? []) as CvSection[],
        );
        setIsGenerating(false);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [adaptationId]);

  useEffect(() => {
    if (!isGenerating) return;
    let attempts = 0;
    const MAX = 12;

    async function attempt() {
      if (attempts >= MAX) {
        setIsGenerating(false);
        return;
      }
      attempts++;
      const done = await pollContent();
      if (!done) {
        pollRef.current = setTimeout(attempt, 2500);
      }
    }

    pollRef.current = setTimeout(attempt, 1500);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [isGenerating, pollContent]);

  const score = analysisData.fit?.score ?? 0;
  const scoreAfter = analysisData.fit?.score_pos_ajustes ?? undefined;
  const ajustes = analysisData.ajustes_conteudo ?? [];
  const sectionGroups = buildSectionGroups(ajustes, sectionMapping);
  const highlightedSection = activeAjusteKey
    ? (sectionMapping[activeAjusteKey] ?? null)
    : null;

  const displaySections = (
    isEditing
      ? editedSections
      : ((editedCvJson ?? finalCvOutput)?.sections ?? [])
  ) as CvSection[];
  const headerSection = displaySections.find((s) => s.sectionType === "header");
  const bodySections = displaySections.filter(
    (s) => s.sectionType !== "header",
  );

  function handleAjusteSelect(key: string) {
    const next = key === activeAjusteKey ? null : key;
    setActiveAjusteKey(next);
    if (next && cvPanelRef.current) {
      const mapped = sectionMapping[key];
      if (mapped) {
        const target = cvPanelRef.current.querySelector(
          `[data-section-type="${mapped}"]`,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function updateSection(
    sectionIdx: number,
    updater: (s: CvSection) => CvSection,
  ) {
    setEditedSections((prev) =>
      prev.map((s, i) => (i === sectionIdx ? updater(s) : s)),
    );
  }

  function handleBulletsChange(
    sectionIdx: number,
    itemIdx: number,
    bullets: string[],
  ) {
    updateSection(sectionIdx, (s) => ({
      ...s,
      items: s.items.map((it, ii) =>
        ii !== itemIdx ? it : { ...it, bullets },
      ),
    }));
  }

  function handleItemChange(
    sectionIdx: number,
    itemIdx: number,
    field: "heading" | "subheading" | "dateRange" | "bullets",
    value: string | string[],
  ) {
    updateSection(sectionIdx, (s) => ({
      ...s,
      items: s.items.map((it, ii) =>
        ii !== itemIdx ? it : { ...it, [field]: value },
      ),
    }));
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
    const base = ((editedCvJson ?? finalCvOutput)?.sections ??
      []) as CvSection[];
    setEditedSections(base);
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

  return (
    <PageShell>
      <AppHeader />

      <DownloadProgressOverlay
        open={downloadOpen}
        stage={downloadStage}
        format={downloadFormat}
      />

      {/* Full-height flex container — sidebar fixed, main scrolls */}
      <div
        style={{
          display: "flex",
          height: `calc(100dvh - ${HEADER_H}px)`,
          marginTop: HEADER_H,
          background: PAGE_BG,
          overflow: "hidden",
        }}
      >
        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside
          style={{
            width: SIDEBAR_W,
            flexShrink: 0,
            background: SIDEBAR_BG,
            borderRight: `1px solid ${SIDEBAR_BORDER}`,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {/* Job info + back link */}
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: `1px solid ${SIDEBAR_BORDER}`,
              flexShrink: 0,
            }}
          >
            <Link
              href={`/adaptar/resultado?adaptationId=${adaptationId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                color: "#444",
                textDecoration: "none",
                marginBottom: 8,
                letterSpacing: "0.02em",
              }}
            >
              ← análise completa
            </Link>
            {(jobTitle || companyName) && (
              <div>
                {jobTitle && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#d0d0d0",
                      lineHeight: 1.3,
                    }}
                  >
                    {jobTitle}
                  </div>
                )}
                {companyName && (
                  <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                    {companyName}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Score ring */}
          <ScoreRing score={score} scoreAfter={scoreAfter} />

          {/* Improvement groups — scrollable */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sectionGroups.length > 0 && (
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#333",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Melhorias aplicadas
              </div>
            )}
            {sectionGroups.map((g) => (
              <SectionGroupBlock
                key={g.sectionType}
                group={g}
                activeKey={activeAjusteKey}
                onSelect={handleAjusteSelect}
              />
            ))}
          </div>

          {/* Download CTA */}
          <div
            style={{
              padding: "14px 16px",
              borderTop: `1px solid ${SIDEBAR_BORDER}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => handleDownload("pdf")}
              style={{
                width: "100%",
                padding: "11px 0",
                background: LIME,
                color: "#0a0a0a",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
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
                padding: "9px 0",
                background: "transparent",
                color: "#777",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ↓ Baixar DOCX
            </button>
          </div>
        </aside>

        {/* ── Main CV panel ─────────────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px",
          }}
        >
          {/* Edit toolbar */}
          {!isGenerating && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
              }}
            >
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    style={{
                      padding: "7px 14px",
                      background: "transparent",
                      color: "#666",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      fontSize: 11,
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
                      padding: "7px 18px",
                      background:
                        saveStatus === "saved"
                          ? "#22c55e"
                          : saveStatus === "error"
                            ? "#ef4444"
                            : LIME,
                      color: "#0a0a0a",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: saveStatus === "saving" ? "default" : "pointer",
                      opacity: saveStatus === "saving" ? 0.6 : 1,
                    }}
                  >
                    {saveStatus === "saving"
                      ? "Salvando..."
                      : saveStatus === "saved"
                        ? "✓ Salvo"
                        : saveStatus === "error"
                          ? "Erro — tente novamente"
                          : "Salvar edições"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: "7px 18px",
                    background: "rgba(255,255,255,0.04)",
                    color: "#aaa",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  ✏ Editar CV
                </button>
              )}
            </div>
          )}

          {/* CV card or generating spinner */}
          {isGenerating ? (
            <GeneratingState />
          ) : (
            <div
              ref={cvPanelRef}
              style={{
                background: CV_BG,
                borderRadius: 12,
                padding: "40px 44px",
                maxWidth: 720,
                margin: "0 auto",
                boxShadow: "0 2px 32px rgba(0,0,0,0.6)",
                minHeight: 500,
              }}
            >
              {/* Header section */}
              {headerSection && (
                <HeaderSectionView
                  section={headerSection}
                  isHighlighted={!isEditing && highlightedSection === "header"}
                  isEditing={isEditing}
                  onItemChange={(itemIdx, field, value) => {
                    const sectionIdx = displaySections.indexOf(headerSection);
                    handleItemChange(sectionIdx, itemIdx, field, value);
                  }}
                />
              )}

              {/* Body sections */}
              {bodySections.map((section) => {
                const sectionIdx = displaySections.indexOf(section);
                return (
                  <CvSectionBlock
                    key={section.sectionType}
                    section={section}
                    isHighlighted={
                      !isEditing && highlightedSection === section.sectionType
                    }
                    isEditing={isEditing}
                    onBulletsChange={(itemIdx, bullets) =>
                      handleBulletsChange(sectionIdx, itemIdx, bullets)
                    }
                    onItemChange={(itemIdx, field, value) =>
                      handleItemChange(
                        sectionIdx,
                        itemIdx,
                        field,
                        value as string,
                      )
                    }
                  />
                );
              })}

              {/* Fallback if no sections */}
              {displaySections.length === 0 && (
                <div
                  style={{
                    background: AMBER_SOFT,
                    border: `1px solid ${AMBER_BORDER}`,
                    borderRadius: 10,
                    padding: "14px 18px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      color: "#7a3d10",
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    Esta análise foi gerada em formato legado. Reanalise seu CV
                    para acessar a visualização completa.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </PageShell>
  );
}
