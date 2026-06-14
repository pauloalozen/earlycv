"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { AppInternalRole } from "@/lib/app-session";

// ─── Design tokens ────────────────────────────────────────────────────────────
const SIDEBAR_W = 354;
const HEADER_H = 64;
const SIDEBAR_BG = "#111";
const SIDEBAR_BORDER = "rgba(255,255,255,0.07)";
const PAGE_BG = "#0a0a0a";
const CV_BG = "#ffffff";
const LIME = "#c6ff3a";
const AMBER = "#d4854a";
const AMBER_SOFT = "rgba(212,133,74,0.1)";
const AMBER_BORDER = "rgba(212,133,74,0.35)";
const HIGHLIGHT_BG = "rgba(198,255,58,0.08)";
const HIGHLIGHT_ITEM_BG = "rgba(198,255,58,0.13)";
const HIGHLIGHT_BORDER = "rgba(198,255,58,0.4)";
const CV_DIVIDER = "#e5e5e1";
const CV_META = "#999";
const CV_SECONDARY = "#555";
const CATEGORY_GROUPS = {
  rewrite:  { label: "Texto reescrito",    color: AMBER },
  content:  { label: "Ajuste de Conteúdo", color: "#5da0e8" },
  keywords: { label: "Keywords Incluídas", color: LIME },
} as const;

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

type CategoryKey = keyof typeof CATEGORY_GROUPS;

function mapCategoriaToGroupKey(
  categoria: string | undefined,
  sectionType?: string,
): CategoryKey {
  if (categoria === "keywords_incluidas") return "keywords";
  if (categoria === "texto_reescrito") return "rewrite";
  if (categoria === "ajuste_conteudo") return "content";
  // Legacy fallback: infer from sectionType when categoria is absent
  if (sectionType === "skills") return "keywords";
  if (["experience", "education", "projects"].includes(sectionType ?? ""))
    return "rewrite";
  return "content";
}

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
  adaptationStatus: string | null;
  userName: string | null;
  userRole: AppInternalRole | null;
  availableCredits?: number | "∞" | "—";
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
    experience: "Experiência Profissional",
    education: "Formação Acadêmica",
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

  const groupMap = new Map<CategoryKey, SectionGroup>(
    (
      Object.entries(CATEGORY_GROUPS) as [
        CategoryKey,
        { label: string; color: string },
      ][]
    ).map(([key, def]) => [
      key,
      { sectionType: key, label: def.label, color: def.color, ajustes: [] },
    ]),
  );

  for (const a of ajustes) {
    const key = a.id ?? a.titulo;
    if (!key) continue;
    // Use categoria from analysis when available; fall back to legacy sectionMapping heuristic
    const legacySectionType = sectionMapping[key];
    const catKey = mapCategoriaToGroupKey(a.categoria, legacySectionType);
    groupMap.get(catKey)?.ajustes.push({
      key,
      titulo: a.titulo,
      descricao: a.descricao,
      pontos: a.pontos,
      dica: a.dica,
    });
  }

  return Array.from(groupMap.values()).filter((g) => g.ajustes.length > 0);
}

/** Returns the best-matching item index within a section for a given ajuste. */
function findBestItemIdx(ajuste: AjusteWithKey, section: CvSection): number {
  const keywords = ajuste.titulo
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (!keywords.length) return 0;

  let best = 0;
  let bestScore = -1;

  section.items.forEach((item, idx) => {
    const text = [item.heading, item.subheading, ...item.bullets]
      .join(" ")
      .toLowerCase();
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  });

  return best;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({
  scoreBefore,
  scoreAfter,
}: {
  scoreBefore: number;
  scoreAfter?: number;
}) {
  const colorsBefore = getAtsScoreColors(scoreBefore);
  const colorsAfter = scoreAfter ? getAtsScoreColors(scoreAfter) : null;
  const hasAfter = scoreAfter !== undefined && scoreAfter > scoreBefore;
  const delta = hasAfter ? (scoreAfter ?? 0) - scoreBefore : 0;

  return (
    <div
      style={{
        padding: "18px 16px 16px",
        borderBottom: `1px solid ${SIDEBAR_BORDER}`,
        flexShrink: 0,
      }}
    >
      {/* ANTES → DEPOIS numbers */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 2,
            }}
          >
            Antes
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 32,
              fontWeight: 800,
              color: colorsBefore.primary,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {scoreBefore}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            {scoreLabel(scoreBefore)}
          </div>
        </div>

        {hasAfter && (
          <>
            <div
              style={{
                flex: 1,
                height: 1,
                background: SIDEBAR_BORDER,
                margin: "0 8px",
                position: "relative",
                top: 6,
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: LIME,
                fontFamily: "monospace",
                fontWeight: 700,
                position: "relative",
                top: 6,
              }}
            >
              +{delta}
            </div>
            <div
              style={{
                flex: 1,
                height: 1,
                background: SIDEBAR_BORDER,
                margin: "0 8px",
                position: "relative",
                top: 6,
              }}
            />
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 2,
                }}
              >
                Depois
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 32,
                  fontWeight: 800,
                  color: colorsAfter?.primary ?? LIME,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                }}
              >
                {scoreAfter}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: colorsAfter?.primary ?? LIME,
                  marginTop: 2,
                }}
              >
                {scoreLabel(scoreAfter ?? 0)}
              </div>
            </div>
          </>
        )}

        {!hasAfter && (
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colorsBefore.primary,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              ATS {scoreLabel(scoreBefore)}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {hasAfter && (
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.05)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Before segment */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${scoreBefore}%`,
              background: colorsBefore.primary,
              borderRadius: 2,
              opacity: 0.4,
            }}
          />
          {/* After segment */}
          <div
            style={{
              position: "absolute",
              left: `${scoreBefore}%`,
              top: 0,
              bottom: 0,
              width: `${delta}%`,
              background: LIME,
              borderRadius: "0 2px 2px 0",
            }}
          />
        </div>
      )}
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
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: group.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: group.color,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            flex: 1,
          }}
        >
          {group.label}
        </span>
        {totalPts > 0 && (
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#888" }}>
            +{totalPts}pts
          </span>
        )}
      </div>

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
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? "#fff" : "#c8c8c8",
                  lineHeight: 1.3,
                  flex: 1,
                  transition: "color 0.12s",
                }}
              >
                {a.titulo}
              </span>
              {a.pontos > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActive ? LIME : AMBER,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    marginTop: 1,
                  }}
                >
                  +{a.pontos}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: 12,
                color: "#888",
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
        marginBottom: 24,
        paddingBottom: 20,
        borderBottom: `1px solid ${CV_DIVIDER}`,
        borderRadius: isHighlighted ? 6 : 0,
        padding: isHighlighted ? "12px 14px" : "0 0 20px",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        border: isHighlighted ? `1.5px solid ${HIGHLIGHT_BORDER}` : "none",
        transition: "background 0.2s, border-color 0.2s",
        scrollMarginTop: 16,
      }}
    >
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label htmlFor="hdr-heading" style={labelStyle}>
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
            <label htmlFor="hdr-subheading" style={labelStyle}>
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
            <label htmlFor="hdr-contact" style={labelStyle}>
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
        <>
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
                gap: "2px 6px",
              }}
            >
              {item.bullets.map((b, i) => (
                <span key={b}>
                  {i > 0 && (
                    <span style={{ marginRight: 6, opacity: 0.4 }}>·</span>
                  )}
                  {b}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryBlock({
  summary,
  isHighlighted,
}: {
  summary: string;
  isHighlighted?: boolean;
}) {
  return (
    <div
      data-section-type="summary"
      style={{
        marginBottom: 22,
        scrollMarginTop: 16,
        borderRadius: isHighlighted ? 6 : 0,
        padding: isHighlighted ? "10px 12px" : "0",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        border: isHighlighted ? `1.5px solid ${HIGHLIGHT_BORDER}` : "none",
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#9ca3af",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: "#9ca3af",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Perfil Profissional
        </span>
        <div style={{ flex: 1, height: 1, background: CV_DIVIDER }} />
      </div>
      <p
        style={{
          fontSize: 11.5,
          color: "#333",
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        {summary}
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: CV_META,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 3,
};

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

function HighlightedText({
  text,
  highlight,
  color,
}: {
  text: string;
  highlight?: string;
  color: string;
}) {
  if (!highlight) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: `${color}30`,
          color: "inherit",
          borderRadius: 2,
          padding: "0 1px",
          outline: `1px solid ${color}60`,
        }}
      >
        {text.slice(idx, idx + highlight.length)}
      </mark>
      {text.slice(idx + highlight.length)}
    </>
  );
}

function CvSectionBlock({
  section,
  isHighlighted,
  highlightedItemIdx,
  highlightText,
  highlightColor,
  isEditing,
  onBulletsChange,
  onItemChange,
}: {
  section: CvSection;
  isHighlighted: boolean;
  highlightedItemIdx?: number;
  highlightText?: string;
  highlightColor?: string;
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
          {section.title || sectionLabel(section.sectionType)}
        </span>
        <div style={{ flex: 1, height: 1, background: CV_DIVIDER }} />
      </div>

      {section.items.map((item, itemIdx) => {
        const itemHighlighted =
          isHighlighted &&
          !isEditing &&
          highlightedItemIdx !== undefined &&
          highlightedItemIdx === itemIdx;
        return (
          <div
            key={item.heading ?? String(itemIdx)}
            data-item-idx={itemIdx}
            style={{
              marginBottom: 14,
              borderRadius: 6,
              padding: itemHighlighted ? "8px 10px" : "0",
              background: itemHighlighted ? HIGHLIGHT_ITEM_BG : "transparent",
              border: itemHighlighted
                ? `1px solid ${HIGHLIGHT_BORDER}`
                : "1px solid transparent",
              transition: "background 0.2s, border-color 0.2s",
              scrollMarginTop: 16,
            }}
          >
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

            {isEditing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {item.bullets.map((bullet, bIdx) => (
                  <div
                    key={`edit-${itemIdx}-${bIdx}`}
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "flex-start",
                    }}
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
                  {item.bullets.map((bullet, bIdx) => {
                    const isHighlightedBullet =
                      itemHighlighted && highlightText
                        ? (() => {
                            // prefer bullet_index from changes if present
                            const change = item.changes?.find(
                              (c) => c.highlight_text === highlightText,
                            );
                            if (change?.bullet_index !== undefined) {
                              return bIdx === change.bullet_index;
                            }
                            // fallback: check if this bullet contains the text
                            return bullet
                              .toLowerCase()
                              .includes(highlightText.toLowerCase());
                          })()
                        : false;
                    return (
                      <li
                        key={`${bullet}-${bIdx}`}
                        style={{
                          fontSize: 11,
                          color: "#333",
                          lineHeight: 1.6,
                          marginBottom: 2,
                        }}
                      >
                        {isHighlightedBullet ? (
                          <HighlightedText
                            text={bullet}
                            highlight={highlightText}
                            color={highlightColor ?? LIME}
                          />
                        ) : (
                          bullet
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        );
      })}
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
          border: "3px solid rgba(198,255,58,0.15)",
          borderTop: `3px solid ${LIME}`,
          animation: "spin 0.9s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
          Finalizando seu CV adaptado...
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
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
  adaptationStatus,
  userName,
  userRole,
  availableCredits,
}: Props) {
  const [finalCvOutput, setFinalCvOutput] = useState(initialFinalCvOutput);
  const [sectionMapping, setSectionMapping] = useState(initialSectionMapping);
  const isDelivered =
    adaptationStatus === "delivered" &&
    hasSections(editedCvJson ?? initialFinalCvOutput);
  const [isGenerating, setIsGenerating] = useState(!isDelivered);

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

  // Lock body scroll so only the main panel scrolls
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Poll until finalCvOutput has real sections
  const pollContent = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv-adaptation/${adaptationId}/content`, {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const payload = (await res.json()) as {
        finalCvOutput?: { sections?: unknown[]; summary?: string } | null;
        sectionMapping?: Record<string, string>;
        status?: string;
      };
      const isDone =
        payload.status === "delivered" &&
        payload.finalCvOutput &&
        Array.isArray(payload.finalCvOutput.sections) &&
        payload.finalCvOutput.sections.length > 0;
      if (isDone) {
        setFinalCvOutput(payload.finalCvOutput as FinalCvOutput);
        if (payload.sectionMapping) setSectionMapping(payload.sectionMapping);
        setEditedSections(
          (payload.finalCvOutput!.sections ?? []) as CvSection[],
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

  // Score values
  const scoreBefore =
    analysisData.scoring?.totals?.scoreAtualBase ??
    analysisData.projecao_melhoria?.score_atual ??
    analysisData.fit?.score ??
    0;

  const ajustes = analysisData.ajustes_conteudo ?? [];
  const sectionGroups = buildSectionGroups(ajustes, sectionMapping);
  const totalAjustesPontos = ajustes.reduce((s: number, a: { pontos: number }) => s + (a.pontos ?? 0), 0);
  const scoreAfter = totalAjustesPontos > 0 ? Math.min(100, scoreBefore + totalAjustesPontos) : undefined;

  const displaySections = (
    isEditing
      ? editedSections
      : ((editedCvJson ?? finalCvOutput)?.sections ?? [])
  ) as CvSection[];

  const cvSummary = (editedCvJson ?? finalCvOutput)?.summary;

  const headerSection = displaySections.find((s) => s.sectionType === "header");
  const bodySections = displaySections.filter(
    (s) => s.sectionType !== "header",
  );

  // Precompute ajuste → {sectionType, itemIdx, highlightText} map for item-level navigation
  const ajusteItemMap = useMemo(() => {
    const map: Record<
      string,
      { sectionType: string; itemIdx: number; highlightText?: string }
    > = {};

    // Primary: scan changes[] embedded in CV items (new contract)
    for (const section of displaySections) {
      section.items.forEach((item, itemIdx) => {
        for (const change of item.changes ?? []) {
          if (!map[change.ajuste_id]) {
            map[change.ajuste_id] = {
              sectionType: section.sectionType,
              itemIdx,
              highlightText: change.highlight_text,
            };
          }
        }
      });
    }

    // texto_reescrito → always navigate to summary section
    for (const a of ajustes) {
      const key = a.id ?? a.titulo;
      if (!key || map[key]) continue;
      if (a.categoria === "texto_reescrito") {
        map[key] = { sectionType: "summary", itemIdx: 0 };
        continue;
      }
      // keywords_incluidas: text-search CV for the keyword term
      if (a.categoria === "keywords_incluidas") {
        const term = a.titulo.toLowerCase();
        let found = false;
        outer: for (const section of displaySections) {
          for (let itemIdx = 0; itemIdx < section.items.length; itemIdx++) {
            const item = section.items[itemIdx];
            const text = [item.heading ?? "", ...(item.bullets ?? [])]
              .join(" ")
              .toLowerCase();
            if (text.includes(term)) {
              map[key] = {
                sectionType: section.sectionType,
                itemIdx,
                highlightText: a.titulo,
              };
              found = true;
              break outer;
            }
          }
        }
        if (!found) {
          // Last resort: navigate to skills section if present
          const skillsSection = displaySections.find(
            (s) => s.sectionType === "skills",
          );
          if (skillsSection) {
            map[key] = { sectionType: "skills", itemIdx: 0, highlightText: a.titulo };
          }
        }
        continue;
      }
      // Fallback: legacy sectionMapping + heuristic
      const sectionType = sectionMapping[key];
      if (!sectionType) continue;
      const section = displaySections.find((s) => s.sectionType === sectionType);
      if (!section) continue;
      map[key] = {
        sectionType,
        itemIdx: findBestItemIdx(
          { key, titulo: a.titulo, descricao: a.descricao, pontos: a.pontos },
          section,
        ),
      };
    }

    return map;
  }, [ajustes, sectionMapping, displaySections]);

  // Active highlight derived from activeAjusteKey
  const activeMapping = activeAjusteKey
    ? (ajusteItemMap[activeAjusteKey] ?? null)
    : null;
  const highlightedSection = activeMapping?.sectionType ?? null;
  const highlightedItemIdx = activeMapping?.itemIdx;
  const activeHighlightText = activeMapping?.highlightText;

  // Resolve category color for the active ajuste
  const activeAjusteCategoria = activeAjusteKey
    ? ajustes.find((a) => (a.id ?? a.titulo) === activeAjusteKey)?.categoria
    : undefined;
  const activeHighlightColor =
    CATEGORY_GROUPS[mapCategoriaToGroupKey(activeAjusteCategoria)]?.color ??
    LIME;

  function handleAjusteSelect(key: string) {
    const next = key === activeAjusteKey ? null : key;
    setActiveAjusteKey(next);
    if (next && cvPanelRef.current) {
      const mapping = ajusteItemMap[next];
      if (mapping) {
        const sectionEl = cvPanelRef.current.querySelector(
          `[data-section-type="${mapping.sectionType}"]`,
        );
        const itemEl = sectionEl?.querySelector(
          `[data-item-idx="${mapping.itemIdx}"]`,
        );
        const target = itemEl ?? sectionEl;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  const totalAjustes = ajustes.length;

  return (
    <PageShell>
      <AppHeader
        userName={userName ?? undefined}
        userRole={userRole ?? null}
        availableCredits={availableCredits}
      />

      <DownloadProgressOverlay
        open={downloadOpen}
        stage={downloadStage}
        format={downloadFormat}
      />

      {/* Full-height flex container — sidebar fixed, main scrolls */}
      <div
        style={{
          position: "fixed",
          top: HEADER_H,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          background: PAGE_BG,
          overflow: "hidden",
        }}
      >
        {/* ── Sidebar ─────────────────────────────────────────────── */}
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
              padding: "12px 16px 10px",
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
                fontSize: 12,
                color: "#444",
                textDecoration: "none",
                marginBottom: 6,
              }}
            >
              ← análise completa
            </Link>
            {(jobTitle || companyName) && (
              <div>
                {jobTitle && (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#d0d0d0",
                      lineHeight: 1.3,
                    }}
                  >
                    {jobTitle}
                  </div>
                )}
                {companyName && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>
                    {companyName}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Score ANTES/DEPOIS */}
          <ScoreBar scoreBefore={scoreBefore} scoreAfter={scoreAfter} />

          {/* Improvement groups — scrollable, no visible scrollbar */}
          <div
            style={
              {
                flex: 1,
                overflowY: "auto",
                // Hide scrollbar across browsers
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              } as React.CSSProperties
            }
          >
            <style>{`aside div::-webkit-scrollbar { display: none; }`}</style>
            {sectionGroups.length > 0 && (
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#333",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {totalAjustes} ajuste{totalAjustes !== 1 ? "s" : ""} aplicados
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
              padding: "12px 16px",
              borderTop: `1px solid ${SIDEBAR_BORDER}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flexShrink: 0,
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
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              ↓ Baixar CV adaptado
            </button>
            <button
              type="button"
              onClick={() => handleDownload("docx")}
              style={{
                width: "100%",
                padding: "8px 0",
                background: "transparent",
                color: "#666",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ↓ Baixar DOCX
            </button>
          </div>
        </aside>

        {/* ── Main CV panel ────────────────────────────────────────── */}
        <style>{`
          .cv-main-scroll::-webkit-scrollbar { width: 6px; }
          .cv-main-scroll::-webkit-scrollbar-track { background: transparent; }
          .cv-main-scroll::-webkit-scrollbar-thumb { background: rgba(10,10,10,0.18); border-radius: 3px; }
        `}</style>
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Hint bar — legenda de cores, fora do scroll */}
          {!isGenerating && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 28px",
                background: "#cac8c2",
                borderBottom: "1px solid rgba(10,10,10,0.07)",
                flexShrink: 0,
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                color: "#7a7874",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: LIME,
                    boxShadow: "0 0 5px rgba(198,255,58,0.7)",
                  }}
                />
                <span>Clique nos destaques para editar o texto diretamente</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {[
                  {
                    bg: "rgba(198,255,58,0.25)",
                    bd: "rgba(198,255,58,0.5)",
                    label: "Palavras-chave / Métricas",
                  },
                  {
                    bg: "rgba(212,133,74,0.2)",
                    bd: "rgba(212,133,74,0.45)",
                    label: "Texto reescrito",
                  },
                  {
                    bg: "rgba(93,160,232,0.18)",
                    bd: "rgba(93,160,232,0.45)",
                    label: "Formatação",
                  },
                ].map((l) => (
                  <div
                    key={l.label}
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <div
                      style={{
                        width: 13,
                        height: 8,
                        borderRadius: 2,
                        background: l.bg,
                        border: `1.5px solid ${l.bd}`,
                      }}
                    />
                    <span>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scrollable content */}
          <div
            className="cv-main-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 32px",
              background: "#d0cec8",
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
                marginBottom: 16,
                maxWidth: 720,
                marginLeft: "auto",
                marginRight: "auto",
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
                    background: "#1a1a1a",
                    color: "#f0f0f0",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
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
                borderRadius: 0,
                padding: "40px 44px",
                maxWidth: 720,
                margin: "0 auto 40px",
                boxShadow: "0 2px 32px rgba(0,0,0,0.6)",
                minHeight: 500,
              }}
            >
              {/* Header */}
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

              {/* Professional summary */}
              {cvSummary && (
                <SummaryBlock
                  summary={cvSummary}
                  isHighlighted={!isEditing && highlightedSection === "summary"}
                />
              )}

              {/* Body sections */}
              {bodySections.map((section) => {
                const sectionIdx = displaySections.indexOf(section);
                const isSectionHighlighted =
                  !isEditing && highlightedSection === section.sectionType;
                return (
                  <CvSectionBlock
                    key={section.sectionType}
                    section={section}
                    isHighlighted={isSectionHighlighted}
                    highlightedItemIdx={
                      isSectionHighlighted ? highlightedItemIdx : undefined
                    }
                    highlightText={
                      isSectionHighlighted ? activeHighlightText : undefined
                    }
                    highlightColor={
                      isSectionHighlighted ? activeHighlightColor : undefined
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

              {/* Fallback: no sections */}
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
          </div>
        </main>
      </div>
    </PageShell>
  );
}
