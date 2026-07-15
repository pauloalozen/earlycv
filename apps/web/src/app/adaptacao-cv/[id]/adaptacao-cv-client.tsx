"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAtsScoreColors } from "@/app/adaptar/resultado/ats-score-colors";
import { AppHeader } from "@/components/app-header";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import type { AppInternalRole } from "@/lib/app-session";
import type { DownloadProgressStage } from "@/lib/client-download";
import { downloadFromApi } from "@/lib/client-download";
import type {
  CvAnalysisData,
  CvSection,
  FinalCvOutput,
} from "@/lib/cv-adaptation-api";
import {
  analyzeAuthenticatedCv,
  getCvAdaptationContent,
  resetCvAdaptationContent,
  saveGuestPreview,
  saveReanalysisResult,
  updateCvAdaptationContent,
} from "@/lib/cv-adaptation-api";

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

const ADD_ITEM_LABEL: Record<string, string> = {
  experience: "+ Adicionar experiência",
  education: "+ Adicionar formação",
  skills: "+ Adicionar grupo",
  certifications: "+ Adicionar certificação",
  languages: "+ Adicionar idioma",
  projects: "+ Adicionar projeto",
  other: "+ Adicionar item",
};

const SECTION_HAS_SUBHEADING = new Set([
  "experience",
  "education",
  "projects",
  "certifications",
]);
const SECTION_HAS_DATE = new Set([
  "experience",
  "education",
  "projects",
  "certifications",
]);
const CV_DIVIDER = "#e5e5e1";
const CV_META = "#999";
const CV_SECONDARY = "#555";
const CATEGORY_GROUPS = {
  rewrite: { label: "Texto reescrito", color: AMBER },
  content: { label: "Ajuste de Conteúdo", color: "#5da0e8" },
  keywords: { label: "Keywords Incluídas", color: LIME },
} as const;

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
  isLegacyFormat?: boolean;
  jobTitle: string | null;
  companyName: string | null;
  jobDescriptionText: string | null;
  adaptationStatus: string | null;
  userName: string | null;
  userRole: AppInternalRole | null;
  availableCredits?: number | "∞" | "—";
  jobApplicationId?: string | null;
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

function detectCvLanguage(summary: string, sections: CvSection[]): "pt" | "en" {
  const text = [summary, ...sections.map((s) => s.title)]
    .join(" ")
    .toLowerCase();
  const ptScore = (
    text.match(
      /\b(de|para|com|em|uma|não|por|do|da|experiência|formação|idiomas|competências)\b/g,
    ) ?? []
  ).length;
  const enScore = (
    text.match(
      /\b(the|and|with|for|experience|education|skills|languages|certifications|summary)\b/g,
    ) ?? []
  ).length;
  return enScore > ptScore ? "en" : "pt";
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
    const text = [item.heading, item.subheading, ...(item.bullets ?? [])]
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

const SECTION_TEXT_LABELS: Record<string, string> = {
  experience: "EXPERIÊNCIA PROFISSIONAL",
  education: "FORMAÇÃO ACADÊMICA",
  skills: "COMPETÊNCIAS",
  certifications: "CERTIFICAÇÕES",
  languages: "IDIOMAS",
  projects: "PROJETOS",
  other: "OUTROS",
};

function sectionsToText(sections: CvSection[], summary?: string): string {
  const lines: string[] = [];

  const header = sections.find((s) => s.sectionType === "header");
  if (header?.items[0]) {
    const it = header.items[0];
    if (it.heading) lines.push(it.heading);
    if (it.subheading) lines.push(it.subheading);
    if (it.bullets.length) lines.push(it.bullets.join(" | "));
    lines.push("");
  }

  if (summary?.trim()) {
    lines.push("RESUMO PROFISSIONAL");
    lines.push(summary.trim());
    lines.push("");
  }

  for (const section of sections) {
    if (section.sectionType === "header") continue;
    lines.push(
      SECTION_TEXT_LABELS[section.sectionType] ??
        section.title ??
        section.sectionType.toUpperCase(),
    );
    for (const item of section.items) {
      const heading = [item.heading, item.subheading]
        .filter(Boolean)
        .join(" | ");
      if (heading) lines.push(heading);
      if (item.dateRange) lines.push(item.dateRange);
      for (const b of item.bullets ?? []) {
        if (b.trim()) lines.push(`• ${b}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

function stripContactLabel(text: string): string {
  return text.replace(
    /^(e-?mail|telefone|tel|fone|phone|linkedin|localiza[çc][aã]o|location|endere[çc]o|cidade|city)\s*:\s*/i,
    "",
  );
}

function isContactBullet(raw: string): boolean {
  const labeled =
    /^(e-?mail|telefone|tel|fone|phone|linkedin|github|behance|portfolio|localiza[çc][aã]o|location|endere[çc]o|cidade|city)\s*:/i.test(
      raw,
    );
  if (labeled) return true;
  const s = stripContactLabel(raw).trim();
  if (!s) return false;
  if (s.includes("@")) return true;
  if (/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/.test(s)) return true;
  if (/linkedin|github|behance/i.test(s)) return true;
  if (/^https?:\/\//i.test(s) || /^www\./i.test(s)) return true;
  // city - state (e.g. "Osasco - SP", "São Paulo/SP", "SP")
  if (/^[\p{L}\s]+([-/,]\s*[A-Z]{2}|[A-Z]{2})$/u.test(s)) return true;
  return false;
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
          <span
            style={{ fontSize: 11, fontFamily: "monospace", color: "#888" }}
          >
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
        marginBottom: 20,
        borderRadius: isHighlighted ? 6 : 0,
        padding: isHighlighted ? "12px 14px 16px" : "0 0 16px",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        outline: isHighlighted ? `1.5px solid ${HIGHLIGHT_BORDER}` : "none",
        transition: "background 0.2s",
        scrollMarginTop: 16,
        textAlign: "center",
      }}
    >
      {isEditing ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            textAlign: "left",
          }}
        >
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
            <label htmlFor="hdr-contact" style={labelStyle}>
              Contato (separado por | )
            </label>
            <input
              id="hdr-contact"
              type="text"
              value={(item.bullets ?? []).join(" | ")}
              onChange={(e) =>
                onItemChange(
                  0,
                  "bullets",
                  e.target.value
                    .split("|")
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
                fontWeight: 800,
                color: "#0d0d0d",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
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
          {(item.bullets ?? []).filter(isContactBullet).length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: CV_META,
                marginTop: 6,
                lineHeight: 1.6,
              }}
            >
              {(item.bullets ?? [])
                .filter(isContactBullet)
                .map(stripContactLabel)
                .join(" | ")}
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
  isEditing,
  onSummaryChange,
  lang = "pt",
}: {
  summary: string;
  isHighlighted?: boolean;
  isEditing?: boolean;
  onSummaryChange?: (value: string) => void;
  lang?: "pt" | "en";
}) {
  const summaryLabel =
    lang === "en" ? "Professional Summary" : "Resumo Profissional";
  return (
    <div
      data-section-type="summary"
      style={{
        marginBottom: 20,
        scrollMarginTop: 16,
        borderRadius: isHighlighted ? 6 : 0,
        padding: isHighlighted ? "10px 12px" : "0",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        outline: isHighlighted ? `1.5px solid ${HIGHLIGHT_BORDER}` : "none",
        transition: "background 0.2s",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "#111",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {summaryLabel}
        </span>
        <div style={{ height: 1.5, background: CV_DIVIDER, marginTop: 5 }} />
      </div>
      {isEditing ? (
        <textarea
          value={summary}
          rows={6}
          onChange={(e) => onSummaryChange?.(e.target.value)}
          style={{
            width: "100%",
            fontSize: 11.5,
            color: "#111",
            lineHeight: 1.7,
            border: "1px solid #ddd",
            borderRadius: 4,
            padding: "6px 10px",
            resize: "vertical",
            fontFamily: "inherit",
            background: "#fafaf8",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      ) : (
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
      )}
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
  onAddItem,
  onRemoveItem,
  onRemoveSection,
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
  onAddItem: () => void;
  onRemoveItem: (itemIdx: number) => void;
  onRemoveSection?: () => void;
}) {
  return (
    <div
      data-section-type={section.sectionType}
      style={{
        marginBottom: 20,
        borderRadius: isHighlighted ? 6 : 0,
        padding: isHighlighted ? "12px 14px" : "0",
        background: isHighlighted ? HIGHLIGHT_BG : "transparent",
        outline: isHighlighted ? `1.5px solid ${HIGHLIGHT_BORDER}` : "none",
        transition: "background 0.2s",
        scrollMarginTop: 16,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#111",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {section.title || sectionLabel(section.sectionType)}
          </span>
          {isEditing && section.sectionType === "other" && onRemoveSection && (
            <button
              type="button"
              onClick={onRemoveSection}
              style={{
                fontSize: 10,
                color: "#999",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              ✕ Excluir seção
            </button>
          )}
        </div>
        <div style={{ height: 1.5, background: CV_DIVIDER, marginTop: 5 }} />
      </div>

      {section.sectionType === "skills" && !isEditing
        ? section.items.map((item, itemIdx) => {
            const itemKey = buildSectionItemKey(item);
            const itemHighlighted =
              isHighlighted &&
              highlightedItemIdx !== undefined &&
              highlightedItemIdx === itemIdx;
            const allText = [item.heading, ...(item.bullets ?? [])]
              .filter(Boolean)
              .join(", ");
            const hasHighlight =
              itemHighlighted &&
              highlightText &&
              allText.toLowerCase().includes(highlightText.toLowerCase());
            return (
              <div
                key={itemKey}
                data-item-idx={itemIdx}
                style={{
                  marginBottom: 5,
                  borderRadius: itemHighlighted ? 4 : 0,
                  padding: itemHighlighted ? "4px 6px" : "0",
                  background: itemHighlighted
                    ? HIGHLIGHT_ITEM_BG
                    : "transparent",
                  outline: itemHighlighted
                    ? `1px solid ${HIGHLIGHT_BORDER}`
                    : "none",
                  scrollMarginTop: 16,
                }}
              >
                <span
                  style={{ fontSize: 11.5, lineHeight: 1.65, color: "#333" }}
                >
                  {item.heading && (
                    <strong style={{ fontWeight: 700, color: "#111" }}>
                      {item.heading}:{" "}
                    </strong>
                  )}
                  {hasHighlight ? (
                    <HighlightedText
                      text={(item.bullets ?? []).join(", ")}
                      highlight={highlightText}
                      color={highlightColor ?? LIME}
                    />
                  ) : (
                    (item.bullets ?? []).join(", ")
                  )}
                </span>
              </div>
            );
          })
        : section.items.map((item, itemIdx) => {
            const itemKey = buildSectionItemKey(item);
            const itemHighlighted =
              isHighlighted &&
              !isEditing &&
              highlightedItemIdx !== undefined &&
              highlightedItemIdx === itemIdx;

            const showSubheading = SECTION_HAS_SUBHEADING.has(
              section.sectionType,
            );
            const showDate = SECTION_HAS_DATE.has(section.sectionType);

            return (
              <div
                key={itemKey}
                data-item-idx={itemIdx}
                style={{
                  marginBottom: isEditing ? 16 : 14,
                  borderRadius: isEditing ? 6 : itemHighlighted ? 6 : 0,
                  padding: isEditing
                    ? "10px 12px"
                    : itemHighlighted
                      ? "8px 10px"
                      : "0",
                  background: isEditing
                    ? "rgba(0,0,0,0.02)"
                    : itemHighlighted
                      ? HIGHLIGHT_ITEM_BG
                      : "transparent",
                  border: isEditing
                    ? "1px solid #e0e0dc"
                    : itemHighlighted
                      ? `1px solid ${HIGHLIGHT_BORDER}`
                      : "1px solid transparent",
                  transition: "background 0.2s, border-color 0.2s",
                  scrollMarginTop: 16,
                }}
              >
                {isEditing ? (
                  <>
                    {/* Remove item button */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginBottom: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onRemoveItem(itemIdx)}
                        style={{
                          fontSize: 11,
                          color: "#999",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        ✕ Remover
                      </button>
                    </div>

                    {/* Heading (always shown) */}
                    <div style={{ marginBottom: 4 }}>
                      <label
                        htmlFor={`${section.sectionType}-${itemIdx}-heading`}
                        style={labelStyle}
                      >
                        {section.sectionType === "skills"
                          ? "Categoria"
                          : section.sectionType === "languages"
                            ? "Idioma"
                            : "Cargo / Título"}
                      </label>
                      <input
                        id={`${section.sectionType}-${itemIdx}-heading`}
                        type="text"
                        value={item.heading ?? ""}
                        onChange={(e) =>
                          onItemChange(itemIdx, "heading", e.target.value)
                        }
                        style={inputStyle}
                      />
                    </div>

                    {/* Subheading — only for experience, education, etc. */}
                    {showSubheading && (
                      <div style={{ marginBottom: 4 }}>
                        <label
                          htmlFor={`${section.sectionType}-${itemIdx}-sub`}
                          style={labelStyle}
                        >
                          Empresa / Instituição
                        </label>
                        <input
                          id={`${section.sectionType}-${itemIdx}-sub`}
                          type="text"
                          value={item.subheading ?? ""}
                          onChange={(e) =>
                            onItemChange(itemIdx, "subheading", e.target.value)
                          }
                          style={inputStyle}
                        />
                      </div>
                    )}

                    {/* Date range — only for experience, education, etc. */}
                    {showDate && (
                      <div style={{ marginBottom: 6 }}>
                        <label
                          htmlFor={`${section.sectionType}-${itemIdx}-date`}
                          style={labelStyle}
                        >
                          Período
                        </label>
                        <input
                          id={`${section.sectionType}-${itemIdx}-date`}
                          type="text"
                          value={item.dateRange ?? ""}
                          onChange={(e) =>
                            onItemChange(itemIdx, "dateRange", e.target.value)
                          }
                          style={inputStyle}
                        />
                      </div>
                    )}

                    {/* Bullets */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                      }}
                    >
                      <span style={labelStyle}>
                        {section.sectionType === "skills"
                          ? "Itens (um por linha)"
                          : "Itens"}
                      </span>
                      {(item.bullets ?? []).map((bullet, bIdx) => (
                        <div
                          key={buildBulletKey(itemKey, bullet, bIdx)}
                          style={{
                            display: "flex",
                            gap: 5,
                            alignItems: "flex-start",
                          }}
                        >
                          <textarea
                            value={bullet}
                            rows={section.sectionType === "skills" ? 1 : 2}
                            onChange={(e) => {
                              const next = [...(item.bullets ?? [])];
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
                          <button
                            type="button"
                            onClick={() => {
                              const next = (item.bullets ?? []).filter(
                                (_, i) => i !== bIdx,
                              );
                              onBulletsChange(itemIdx, next);
                            }}
                            style={{
                              fontSize: 14,
                              color: "#bbb",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: "4px 6px",
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          onBulletsChange(itemIdx, [
                            ...(item.bullets ?? []),
                            "",
                          ])
                        }
                        style={{
                          fontSize: 11,
                          color: "#666",
                          background: "transparent",
                          border: "1px dashed #ccc",
                          borderRadius: 4,
                          cursor: "pointer",
                          padding: "5px 10px",
                          textAlign: "left",
                        }}
                      >
                        + Adicionar item
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      {(item.heading || item.subheading) && (
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#111",
                            lineHeight: 1.3,
                          }}
                        >
                          {item.heading}
                          {item.heading && item.subheading && (
                            <span
                              style={{ fontWeight: 400, color: CV_SECONDARY }}
                            >
                              {" "}
                              | {item.subheading}
                            </span>
                          )}
                          {!item.heading && item.subheading}
                        </div>
                      )}
                      {item.dateRange && (
                        <div
                          style={{ fontSize: 11, color: CV_META, marginTop: 2 }}
                        >
                          {item.dateRange}
                        </div>
                      )}
                    </div>

                    {(item.bullets ?? []).length > 0 && (
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 14,
                          listStyle: "disc",
                        }}
                      >
                        {(item.bullets ?? []).map((bullet, bIdx) => {
                          const isHighlightedBullet =
                            itemHighlighted && highlightText
                              ? (() => {
                                  const change = item.changes?.find(
                                    (c) => c.highlight_text === highlightText,
                                  );
                                  if (change?.bullet_index !== undefined) {
                                    return bIdx === change.bullet_index;
                                  }
                                  return bullet
                                    .toLowerCase()
                                    .includes(highlightText.toLowerCase());
                                })()
                              : false;
                          return (
                            <li
                              key={buildBulletKey(itemKey, bullet, bIdx)}
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
                    )}
                  </>
                )}
              </div>
            );
          })}

      {/* Add item button — only in edit mode */}
      {isEditing && (
        <button
          type="button"
          onClick={onAddItem}
          style={{
            fontSize: 12,
            color: "#555",
            background: "transparent",
            border: "1px dashed #bbb",
            borderRadius: 6,
            cursor: "pointer",
            padding: "7px 14px",
            width: "100%",
            textAlign: "left",
            marginTop: 4,
          }}
        >
          {ADD_ITEM_LABEL[section.sectionType] ?? "+ Adicionar item"}
        </button>
      )}
    </div>
  );
}

function SkBar({
  w,
  h,
  mb,
  center,
}: {
  w: string | number;
  h: number;
  mb?: number;
  center?: boolean;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 3,
        background:
          "linear-gradient(90deg,#e4e2dc 25%,#d4d2cc 50%,#e4e2dc 75%)",
        backgroundSize: "600px 100%",
        animation: "cv-shimmer 1.4s infinite linear",
        marginBottom: mb ?? 0,
        ...(center ? { margin: `0 auto ${mb ?? 0}px` } : {}),
      }}
    />
  );
}

function buildSectionItemKey(item: {
  heading?: string;
  subheading?: string;
  dateRange?: string;
  bullets: string[];
  changes?: Array<{ ajuste_id: string }>;
}) {
  return [
    item.heading ?? "",
    item.subheading ?? "",
    item.dateRange ?? "",
    (item.bullets ?? []).join("|"),
    item.changes?.map((change) => change.ajuste_id).join("|") ?? "",
  ].join("::");
}

function buildBulletKey(itemKey: string, bullet: string, bulletIdx: number) {
  return `${itemKey}::${bullet || `empty-${bulletIdx}`}`;
}

function CvSkeleton() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <p
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "#888",
          marginBottom: 14,
          letterSpacing: 0.2,
        }}
      >
        Montando seu CV adaptado…
      </p>
      <div
        style={{
          background: CV_BG,
          maxWidth: 720,
          margin: "0 auto 40px",
          padding: "40px 44px",
          minHeight: 900,
          boxShadow: "0 2px 32px rgba(0,0,0,0.6)",
        }}
      >
        <style>{`@keyframes cv-shimmer { 0% { background-position:-600px 0; } 100% { background-position:600px 0; } }`}</style>
        {/* header */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <SkBar w="52%" h={20} mb={10} center />
          <SkBar w="32%" h={11} mb={7} center />
          <SkBar w="68%" h={10} center mb={0} />
        </div>
        <SkBar w="100%" h={1} mb={20} />
        {/* 4 body sections */}
        {[1, 2, 3, 4].map((si) => (
          <div key={si} style={{ marginBottom: 26 }}>
            <SkBar w="30%" h={10} mb={8} />
            <SkBar w="100%" h={1} mb={10} />
            <SkBar w="60%" h={11} mb={5} />
            <SkBar w="28%" h={9} mb={9} />
            {[85, 78, 65].map((pct) => (
              <SkBar key={pct} w={`${pct}%`} h={9} mb={5} />
            ))}
          </div>
        ))}
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
  isLegacyFormat: initialIsLegacyFormat,
  jobTitle,
  companyName,
  jobDescriptionText,
  adaptationStatus,
  userName,
  userRole,
  availableCredits,
  jobApplicationId,
}: Props) {
  const [finalCvOutput, setFinalCvOutput] = useState(initialFinalCvOutput);
  const [sectionMapping, setSectionMapping] = useState(initialSectionMapping);
  const [isLegacyFormat, setIsLegacyFormat] = useState(
    initialIsLegacyFormat ?? false,
  );
  const isDelivered =
    adaptationStatus === "delivered" &&
    hasSections(editedCvJson ?? initialFinalCvOutput);
  const [isGenerating, setIsGenerating] = useState(!isDelivered);

  // Local copy of saved output so view mode reflects edits immediately after save
  const [localEditedOutput, setLocalEditedOutput] =
    useState<FinalCvOutput | null>(editedCvJson ?? null);

  const initialSections = ((localEditedOutput ?? finalCvOutput)?.sections ??
    []) as CvSection[];
  const initialSummary = (localEditedOutput ?? finalCvOutput)?.summary ?? "";
  const [activeAjusteKey, setActiveAjusteKey] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSections, setEditedSections] =
    useState<CvSection[]>(initialSections);
  const [editedSummary, setEditedSummary] = useState<string>(initialSummary);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const persistedReanalysis = editedCvJson?.reanalysisResult ?? null;
  const [reanaliseState, setReanaliseState] = useState<
    "idle" | "running" | "done" | "error"
  >(persistedReanalysis ? "done" : "idle");
  const [reanaliseAdaptationId, setReanaliseAdaptationId] = useState<
    string | null
  >(persistedReanalysis?.adaptationId ?? null);
  const [reanaliseScore, setReanaliseScore] = useState<number | null>(
    persistedReanalysis?.score ?? null,
  );
  const [_reanaliseError, setReanaliseError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<
    "idle" | "resetting" | "error"
  >("idle");
  const [resetModalMounted, setResetModalMounted] = useState(false);
  const resetModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldShowEditedCard = !!localEditedOutput && !isEditing;
  const [editCardMounted, setEditCardMounted] = useState(shouldShowEditedCard);
  const [editCardVisible, setEditCardVisible] = useState(shouldShowEditedCard);
  const editCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addSectionInputRef = useRef<HTMLInputElement>(null);
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
        isLegacyFormat?: boolean;
      };
      if (typeof payload.isLegacyFormat === "boolean") {
        setIsLegacyFormat(payload.isLegacyFormat);
      }
      const isDone =
        payload.status === "delivered" &&
        payload.finalCvOutput &&
        Array.isArray(payload.finalCvOutput.sections) &&
        payload.finalCvOutput.sections.length > 0;
      if (isDone) {
        setFinalCvOutput(payload.finalCvOutput as FinalCvOutput);
        if (payload.sectionMapping) setSectionMapping(payload.sectionMapping);
        setEditedSections(
          (payload.finalCvOutput?.sections ?? []) as CvSection[],
        );
        setEditedSummary(payload.finalCvOutput?.summary ?? "");
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
    const MAX = 24;

    async function attempt() {
      if (attempts >= MAX) {
        setIsGenerating(false);
        return;
      }
      attempts++;
      const done = await pollContent();
      if (!done) {
        pollRef.current = setTimeout(attempt, 1500);
      }
    }

    pollRef.current = setTimeout(attempt, 500);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [isGenerating, pollContent]);

  useEffect(() => {
    if (addSectionOpen) {
      addSectionInputRef.current?.focus();
    }
  }, [addSectionOpen]);

  useEffect(() => {
    if (resetConfirmOpen) {
      if (resetModalTimerRef.current) clearTimeout(resetModalTimerRef.current);
      setResetModalMounted(true);
    } else if (resetModalMounted) {
      resetModalTimerRef.current = setTimeout(
        () => setResetModalMounted(false),
        260,
      );
    }
    return () => {
      if (resetModalTimerRef.current) clearTimeout(resetModalTimerRef.current);
    };
  }, [resetConfirmOpen, resetModalMounted]);

  useEffect(() => {
    if (shouldShowEditedCard) {
      if (editCardTimerRef.current) clearTimeout(editCardTimerRef.current);
      setEditCardMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setEditCardVisible(true)),
      );
    } else {
      setEditCardVisible(false);
      editCardTimerRef.current = setTimeout(
        () => setEditCardMounted(false),
        230,
      );
    }
    return () => {
      if (editCardTimerRef.current) clearTimeout(editCardTimerRef.current);
    };
  }, [shouldShowEditedCard]);

  // Score values
  const scoreBefore =
    analysisData.scoring?.totals?.scoreAtualBase ??
    analysisData.projecao_melhoria?.score_atual ??
    analysisData.fit?.score ??
    0;

  const ajustes = analysisData.ajustes_conteudo ?? [];
  const sectionGroups = buildSectionGroups(ajustes, sectionMapping);
  const totalAjustesPontos = ajustes.reduce(
    (s: number, a: { pontos: number }) => s + (a.pontos ?? 0),
    0,
  );
  const scoreAfter =
    totalAjustesPontos > 0
      ? Math.min(100, scoreBefore + totalAjustesPontos)
      : undefined;

  const displaySections = (
    isEditing
      ? editedSections
      : ((localEditedOutput ?? finalCvOutput)?.sections ?? [])
  ) as CvSection[];

  const cvSummary = (localEditedOutput ?? finalCvOutput)?.summary;

  const SECTION_ORDER = [
    "experience",
    "skills",
    "education",
    "certifications",
    "projects",
    "languages",
    "other",
  ];
  const headerSection = displaySections.find((s) => s.sectionType === "header");
  const bodySections = displaySections
    .filter((s) => s.sectionType !== "header")
    .sort((a, b) => {
      const ai = SECTION_ORDER.indexOf(a.sectionType);
      const bi = SECTION_ORDER.indexOf(b.sectionType);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  const cvLanguage = detectCvLanguage(cvSummary ?? "", bodySections);

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
            map[key] = {
              sectionType: "skills",
              itemIdx: 0,
              highlightText: a.titulo,
            };
          }
        }
        continue;
      }
      // Fallback: legacy sectionMapping + heuristic
      const sectionType = sectionMapping[key];
      if (!sectionType) continue;
      const section = displaySections.find(
        (s) => s.sectionType === sectionType,
      );
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

  function handleAddItem(sectionIdx: number) {
    updateSection(sectionIdx, (s) => ({
      ...s,
      items: [
        ...s.items,
        { heading: "", subheading: "", dateRange: "", bullets: [""] },
      ],
    }));
  }

  function handleRemoveItem(sectionIdx: number, itemIdx: number) {
    updateSection(sectionIdx, (s) => ({
      ...s,
      items: s.items.filter((_, i) => i !== itemIdx),
    }));
  }

  async function handleReset() {
    setResetStatus("resetting");
    try {
      await resetCvAdaptationContent(adaptationId);
      const fresh = await getCvAdaptationContent(adaptationId);
      const originalOutput = fresh.finalCvOutput ?? null;
      setFinalCvOutput(originalOutput);
      setLocalEditedOutput(null);
      setEditedSections((originalOutput?.sections ?? []) as CvSection[]);
      setEditedSummary(originalOutput?.summary ?? "");
      setReanaliseState("idle");
      setReanaliseScore(null);
      setReanaliseAdaptationId(null);
      setResetConfirmOpen(false);
      setIsEditing(false);
      setResetStatus("idle");
    } catch {
      setResetStatus("error");
      setTimeout(() => setResetStatus("idle"), 3000);
    }
  }

  function handleRemoveSection(sectionIdx: number) {
    setEditedSections((prev) => prev.filter((_, i) => i !== sectionIdx));
  }

  async function handleSave() {
    setSaveStatus("saving");
    try {
      await updateCvAdaptationContent(
        adaptationId,
        editedSections,
        editedSummary,
      );
      setSaveStatus("saved");
      setLocalEditedOutput((prev) => ({
        ...(prev ?? finalCvOutput ?? {}),
        sections: editedSections,
        summary: editedSummary,
      }));
      setIsEditing(false);
      setAddSectionOpen(false);
      setNewSectionTitle("");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  function cancelEditing() {
    const base = ((localEditedOutput ?? finalCvOutput)?.sections ??
      []) as CvSection[];
    setEditedSections(base);
    setEditedSummary((localEditedOutput ?? finalCvOutput)?.summary ?? "");
    setIsEditing(false);
    setSaveStatus("idle");
    setAddSectionOpen(false);
    setNewSectionTitle("");
  }

  function handleAddSection() {
    const title = newSectionTitle.trim();
    if (!title) return;
    setEditedSections((prev) => [
      ...prev,
      {
        sectionType: "other" as const,
        title,
        items: [{ heading: "", bullets: [""] }],
      },
    ]);
    setNewSectionTitle("");
    setAddSectionOpen(false);
  }

  async function handleReanalisar() {
    if (!jobDescriptionText) return;
    setReanaliseState("running");
    setReanaliseError(null);
    try {
      const savedOutput = localEditedOutput ?? editedCvJson ?? finalCvOutput;
      const cvText = sectionsToText(
        isEditing
          ? editedSections
          : ((savedOutput?.sections ?? []) as CvSection[]),
        isEditing ? editedSummary : (savedOutput?.summary ?? ""),
      );

      const formData = new FormData();
      formData.set("jobDescriptionText", jobDescriptionText);
      formData.set("masterCvText", cvText);
      formData.set("inputMode", "text_paste");

      const result = await analyzeAuthenticatedCv(formData, "text_paste");
      if (!result.ok) {
        setReanaliseError(result.error);
        setReanaliseState("error");
        return;
      }

      const saved = await saveGuestPreview({
        adaptedContentJson: result.adaptedContentJson as Record<
          string,
          unknown
        >,
        previewText: result.previewText,
        masterCvText: result.masterCvText,
        analysisCvSnapshotId: result.analysisCvSnapshotId,
        jobDescriptionText,
        jobTitle: jobTitle ?? undefined,
        companyName: companyName ?? undefined,
      });

      const newScore =
        (result.adaptedContentJson as CvAnalysisData)?.scoring?.totals
          ?.scoreAtualBase ??
        (result.adaptedContentJson as CvAnalysisData)?.projecao_melhoria
          ?.score_atual ??
        (result.adaptedContentJson as CvAnalysisData)?.fit?.score ??
        null;

      setReanaliseScore(newScore);
      setReanaliseAdaptationId(saved.id);
      setReanaliseState("done");
      if (newScore !== null) {
        saveReanalysisResult(adaptationId, saved.id, newScore).catch(() => {
          // non-critical — state already updated in memory
        });
      }
    } catch (e) {
      setReanaliseError(
        e instanceof Error ? e.message : "Erro ao reanalisar. Tente novamente.",
      );
      setReanaliseState("error");
    }
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

      {/* Reset confirmation modal */}
      {resetModalMounted && (
        <>
          <style>{`
            @keyframes resetBackdropIn  { from { opacity:0 } to { opacity:1 } }
            @keyframes resetBackdropOut { from { opacity:1 } to { opacity:0 } }
            @keyframes resetPanelIn     { from { opacity:0; transform:scale(0.95) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
            @keyframes resetPanelOut    { from { opacity:1; transform:scale(1) translateY(0) } to { opacity:0; transform:scale(0.95) translateY(10px) } }
          `}</style>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: `${resetConfirmOpen ? "resetBackdropIn" : "resetBackdropOut"} 0.22s ease forwards`,
            }}
          >
            <div
              style={{
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "28px 32px",
                maxWidth: 420,
                width: "calc(100% - 48px)",
                animation: `${resetConfirmOpen ? "resetPanelIn" : "resetPanelOut"} 0.22s ease forwards`,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#f0f0f0",
                  margin: "0 0 10px",
                }}
              >
                Voltar ao CV adaptado original?
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "#aaa",
                  margin: "0 0 24px",
                  lineHeight: 1.6,
                }}
              >
                Todas as alterações manuais feitas serão descartadas e o CV
                voltará à versão gerada pela análise.
              </p>
              {resetStatus === "error" && (
                <p
                  style={{ fontSize: 11, color: "#ef4444", margin: "0 0 12px" }}
                >
                  Erro ao resetar. Tente novamente.
                </p>
              )}
              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setResetConfirmOpen(false);
                    setResetStatus("idle");
                  }}
                  disabled={resetStatus === "resetting"}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    color: "#999",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 7,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetStatus === "resetting"}
                  style={{
                    padding: "8px 20px",
                    background: "#ef4444",
                    color: "#fff",
                    border: "none",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: resetStatus === "resetting" ? "default" : "pointer",
                    opacity: resetStatus === "resetting" ? 0.6 : 1,
                  }}
                >
                  {resetStatus === "resetting" ? "Resetando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Full-height flex container — sidebar fixed, main scrolls */}
      <div
        className="adaptcv-outer"
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
        {/* Mobile backdrop — inside outer container to share stacking context with sidebar */}
        {mobileSidebarOpen && (
          // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop tap-to-close
          // biome-ignore lint/a11y/noStaticElementInteractions: backdrop tap-to-close
          <div
            className="adaptcv-backdrop mobile-open"
            style={{ display: "none" }}
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside
          className={`adaptcv-sidebar${mobileSidebarOpen ? " mobile-open" : ""}`}
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
          {/* Mobile close button */}
          <button
            type="button"
            className="adaptcv-sidebar-close"
            onClick={() => setMobileSidebarOpen(false)}
            style={{
              display: "none",
              alignItems: "center",
              gap: 6,
              padding: "12px 16px",
              background: "transparent",
              color: "#888",
              border: "none",
              borderBottom: `1px solid ${SIDEBAR_BORDER}`,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              width: "100%",
              textAlign: "left",
            }}
          >
            ← Fechar
          </button>

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
                fontSize: 14,
                color: "#888",
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

          {/* Manual edits indicator */}
          {editCardMounted && (
            <div
              style={{
                padding: "8px 14px",
                borderTop: `1px solid ${SIDEBAR_BORDER}`,
                flexShrink: 0,
                background: "rgba(212,133,74,0.06)",
                opacity: editCardVisible ? 1 : 0,
                transform: editCardVisible
                  ? "translateY(0)"
                  : "translateY(6px)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#c45a10",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                CV editado manualmente — use o toolbar para reanalisar ou
                baixar.
              </p>
            </div>
          )}
        </aside>

        {/* ── Main CV panel ────────────────────────────────────────── */}
        <style>{`
          .cv-main-scroll::-webkit-scrollbar { width: 6px; }
          .cv-main-scroll::-webkit-scrollbar-track { background: transparent; }
          .cv-main-scroll::-webkit-scrollbar-thumb { background: rgba(10,10,10,0.18); border-radius: 3px; }
          @media (max-width: 767px) {
            .adaptcv-backdrop { display: block !important; position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 140; opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
            .adaptcv-backdrop.mobile-open { opacity: 1 !important; pointer-events: auto !important; }
            .adaptcv-sidebar {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              bottom: 0 !important;
              width: 86vw !important;
              max-width: 300px !important;
              height: 100dvh !important;
              z-index: 150 !important;
              transform: translateX(-110%) !important;
              transition: transform 0.25s ease !important;
              overflow-y: auto !important;
              overflow-x: hidden !important;
            }
            .adaptcv-sidebar.mobile-open { transform: translateX(0) !important; }
            .adaptcv-sidebar-close { display: flex !important; }
            .adaptcv-main { width: 100% !important; }
            .adaptcv-toolbar { overflow-x: auto !important; flex-wrap: nowrap !important; padding: 5px 8px !important; gap: 5px !important; min-height: auto !important; scrollbar-width: none !important; }
            .adaptcv-toolbar::-webkit-scrollbar { display: none !important; }
            .adaptcv-spacer { display: none !important; }
            .adaptcv-toolbar-separator { display: none !important; }
            .adaptcv-scroll { padding: 10px 6px !important; }
            .adaptcv-cv-card { padding: 20px 14px !important; max-width: 100% !important; box-shadow: 0 1px 8px rgba(0,0,0,0.3) !important; }
            .adaptcv-mobile-toggle { display: inline-flex !important; }
          }
          @media (min-width: 768px) {
            .adaptcv-mobile-toggle { display: none !important; }
            .adaptcv-backdrop { display: none !important; }
            .adaptcv-sidebar-close { display: none !important; }
          }
        `}</style>
        <main
          className="adaptcv-main"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Action toolbar — outside scroll so it stays fixed */}
          {!isGenerating && (
            <div
              className="adaptcv-toolbar"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 20px",
                background: "#cac8c2",
                borderBottom: "1px solid rgba(10,10,10,0.07)",
                flexShrink: 0,
                minHeight: 44,
                position: "relative",
              }}
            >
              {/* Mobile: open ajustes drawer button */}
              <button
                type="button"
                className="adaptcv-mobile-toggle"
                onClick={() => setMobileSidebarOpen(true)}
                style={{
                  display: "none",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 11px",
                  background: "#1a1a1a",
                  color: "#f0f0f0",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ☰ {totalAjustes > 0 ? `${totalAjustes} ajustes` : "Ajustes"}
              </button>

              {/* LEFT: secondary / history actions */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(isEditing || localEditedOutput) &&
                  (reanaliseState === "running" ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          border: `2px solid rgba(212,133,74,0.2)`,
                          borderTop: `2px solid ${AMBER}`,
                          animation: "spin 0.9s linear infinite",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          color: AMBER,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Analisando...
                      </span>
                    </div>
                  ) : reanaliseState === "done" && reanaliseScore !== null ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          alignSelf: "stretch",
                          margin: "-7px 0",
                          padding: "0 14px",
                          background: "#0a0a0a",
                          gap: 6,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: getAtsScoreColors(reanaliseScore).primary,
                            lineHeight: 1,
                          }}
                        >
                          Score editado:
                        </span>
                        <span
                          style={{
                            fontSize: 24,
                            fontWeight: 800,
                            color: getAtsScoreColors(reanaliseScore).primary,
                            lineHeight: 1,
                            letterSpacing: "-0.5px",
                          }}
                        >
                          {reanaliseScore}
                        </span>
                      </span>
                      <Link
                        href={`/adaptar/resultado?adaptationId=${reanaliseAdaptationId}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 13px",
                          background: "#f0ede8",
                          color: "#333",
                          border: "1px solid rgba(10,10,10,0.2)",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 500,
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Ver análise →
                      </Link>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleReanalisar}
                      style={{
                        padding: "6px 12px",
                        background: "#f0ede8",
                        color: "#7a4a10",
                        border: `1px solid ${AMBER_BORDER}`,
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {reanaliseState === "error"
                        ? "⟳ Tentar novamente"
                        : isEditing
                          ? "⟳ Reanalisar edições"
                          : "⟳ Reanalisar CV"}
                    </button>
                  ))}
                {!isEditing && localEditedOutput && (
                  <button
                    type="button"
                    onClick={() => setResetConfirmOpen(true)}
                    style={{
                      padding: "6px 12px",
                      background: "#f0ede8",
                      color: "#444",
                      border: "1px solid rgba(10,10,10,0.2)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ↺ Voltar ao CV adaptado original
                  </button>
                )}
              </div>

              {/* SPACER */}
              <div className="adaptcv-spacer" style={{ flex: 1 }} />

              {/* CENTER: candidatura hyperlink — absolutely centered in bar */}
              {jobApplicationId && (
                <Link
                  href={`/candidaturas/${jobApplicationId}`}
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#333",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    textDecorationColor: "rgba(10,10,10,0.3)",
                    whiteSpace: "nowrap",
                    pointerEvents: "auto",
                  }}
                >
                  Ver candidatura ↗
                </Link>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      style={{
                        padding: "6px 13px",
                        background: "#f0ede8",
                        color: "#333",
                        border: "1px solid rgba(10,10,10,0.22)",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saveStatus === "saving"}
                      style={{
                        padding: "6px 16px",
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
                        whiteSpace: "nowrap",
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
                    onClick={() => {
                      setIsEditing(true);
                      setReanaliseState("idle");
                    }}
                    style={{
                      padding: "6px 16px",
                      background: "#1a1a1a",
                      color: "#f0f0f0",
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✏ Editar CV
                  </button>
                )}
              </div>

              {/* SEPARATOR */}
              <div
                className="adaptcv-toolbar-separator"
                style={{
                  width: 1,
                  height: 22,
                  background: "rgba(10,10,10,0.12)",
                  margin: "0 6px",
                  flexShrink: 0,
                }}
              />

              {/* RIGHT: download actions */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => handleDownload("docx")}
                  style={{
                    padding: "6px 13px",
                    background: "#f0ede8",
                    color: "#333",
                    border: "1px solid rgba(10,10,10,0.2)",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ↓ DOCX
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("pdf")}
                  style={{
                    padding: "6px 16px",
                    background: LIME,
                    color: "#0a0a0a",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ↓ PDF
                </button>
              </div>
            </div>
          )}

          {/* Scrollable content */}
          <div
            className="cv-main-scroll adaptcv-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 32px",
              background: "#d0cec8",
            }}
          >
            {/* CV card or generating spinner */}
            {isGenerating ? (
              <CvSkeleton />
            ) : (
              <div
                ref={cvPanelRef}
                className="adaptcv-cv-card"
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
                    isHighlighted={
                      !isEditing && highlightedSection === "header"
                    }
                    isEditing={isEditing}
                    onItemChange={(itemIdx, field, value) => {
                      const sectionIdx = displaySections.indexOf(headerSection);
                      handleItemChange(sectionIdx, itemIdx, field, value);
                    }}
                  />
                )}

                {/* Professional summary */}
                {(cvSummary || isEditing) && (
                  <SummaryBlock
                    summary={isEditing ? editedSummary : (cvSummary ?? "")}
                    isHighlighted={
                      !isEditing && highlightedSection === "summary"
                    }
                    isEditing={isEditing}
                    onSummaryChange={setEditedSummary}
                    lang={cvLanguage}
                  />
                )}

                {/* Body sections */}
                {bodySections.map((section, bodyIdx) => {
                  const sectionIdx = displaySections.indexOf(section);
                  const isSectionHighlighted =
                    !isEditing && highlightedSection === section.sectionType;
                  return (
                    <CvSectionBlock
                      key={`${section.sectionType}-${section.title || bodyIdx}`}
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
                      onAddItem={() => handleAddItem(sectionIdx)}
                      onRemoveItem={(itemIdx) =>
                        handleRemoveItem(sectionIdx, itemIdx)
                      }
                      onRemoveSection={
                        section.sectionType === "other"
                          ? () => handleRemoveSection(sectionIdx)
                          : undefined
                      }
                    />
                  );
                })}

                {/* Add new section — only in edit mode */}
                {isEditing && (
                  <div style={{ marginTop: 8 }}>
                    {addSectionOpen ? (
                      <div
                        style={{
                          border: "1px solid #d0d0cc",
                          borderRadius: 8,
                          padding: "14px 16px",
                          background: "#fafaf8",
                        }}
                      >
                        <label
                          htmlFor="new-section-title"
                          style={{
                            display: "block",
                            fontSize: 9,
                            fontWeight: 700,
                            color: CV_META,
                            textTransform: "uppercase",
                            letterSpacing: "0.09em",
                            marginBottom: 6,
                          }}
                        >
                          Nome da nova seção
                        </label>
                        <input
                          id="new-section-title"
                          ref={addSectionInputRef}
                          type="text"
                          placeholder="Ex: Voluntariado, Premiações, Publicações…"
                          value={newSectionTitle}
                          onChange={(e) => setNewSectionTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddSection();
                            }
                            if (e.key === "Escape") {
                              setAddSectionOpen(false);
                              setNewSectionTitle("");
                            }
                          }}
                          style={{
                            ...inputStyle,
                            marginBottom: 10,
                            fontSize: 13,
                            padding: "7px 10px",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={handleAddSection}
                            disabled={!newSectionTitle.trim()}
                            style={{
                              padding: "6px 16px",
                              background: newSectionTitle.trim()
                                ? "#111"
                                : "#ccc",
                              color: newSectionTitle.trim()
                                ? "#f0f0f0"
                                : "#888",
                              border: "none",
                              borderRadius: 5,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: newSectionTitle.trim()
                                ? "pointer"
                                : "default",
                            }}
                          >
                            Adicionar seção
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddSectionOpen(false);
                              setNewSectionTitle("");
                            }}
                            style={{
                              padding: "6px 12px",
                              background: "transparent",
                              color: "#999",
                              border: "1px solid #ddd",
                              borderRadius: 5,
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddSectionOpen(true)}
                        style={{
                          width: "100%",
                          padding: "9px 0",
                          background: "transparent",
                          color: "#888",
                          border: "1px dashed #ccc",
                          borderRadius: 7,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          letterSpacing: "0.02em",
                        }}
                      >
                        + Nova seção
                      </button>
                    )}
                  </div>
                )}

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
                      {isLegacyFormat
                        ? "Este currículo foi gerado em uma versão antiga do sistema. Faça uma nova análise para ver o resultado atualizado."
                        : "Ainda estamos finalizando seu currículo. Isso pode levar alguns instantes — atualize a página para ver o resultado."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (isLegacyFormat) {
                          window.location.href = "/adaptar";
                        } else {
                          window.location.reload();
                        }
                      }}
                      style={{
                        marginTop: 10,
                        padding: "7px 14px",
                        background: "transparent",
                        color: "#7a3d10",
                        border: `1px solid ${AMBER_BORDER}`,
                        borderRadius: 7,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {isLegacyFormat ? "Fazer nova análise" : "Atualizar página"}
                    </button>
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
