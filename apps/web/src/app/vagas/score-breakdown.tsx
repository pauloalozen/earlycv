"use client";

import { useState } from "react";
import type {
  MatchBreakdown,
  MatchBreakdownDetails,
  MatchDetailItem,
} from "@/lib/public-jobs-api";
import {
  breakdownPct,
  RADAR_AREA_LABELS,
  RADAR_SENIORITY_LABELS,
  SCORE,
  scoreTier,
} from "./radar-ui";

const MONO = "var(--font-geist-mono), monospace";
const LINE = "rgba(10,10,10,0.08)";

type DimKey = "area" | "skills" | "seniority" | "technologies";

const DIM_LABEL: Record<DimKey, string> = {
  area: "área",
  skills: "skills",
  seniority: "senioridade",
  technologies: "tecnologias",
};

const DIM_TITLE: Record<DimKey, string> = {
  area: "Área",
  skills: "Skills",
  seniority: "Senioridade",
  technologies: "Tecnologias",
};

function itemLabel(dim: DimKey, item: MatchDetailItem): string {
  if (dim === "area") return RADAR_AREA_LABELS[item.label] ?? item.label;
  if (dim === "seniority")
    return RADAR_SENIORITY_LABELS[item.label] ?? item.label;
  return item.label;
}

function DimBar({
  dim,
  pct,
  count,
  open,
  onToggle,
}: {
  dim: DimKey;
  pct: number;
  count: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = SCORE[scoreTier(pct)];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        position: "relative",
        textAlign: "left",
        background: "#fff",
        border: `1px solid ${open ? "#0a0a0a" : LINE}`,
        boxShadow: open ? "0 0 0 1px #0a0a0a" : "none",
        borderRadius: 10,
        padding: "9px 11px 11px",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: open ? "#0a0a0a" : "#3a3a38",
            fontWeight: open ? 600 : 400,
          }}
        >
          {DIM_LABEL[dim]}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            flexShrink: 0,
            color: open ? "#0a0a0a" : "#8a8a85",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .18s",
          }}
        >
          <title>Expandir</title>
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            marginLeft: "auto",
            color: t.fg,
          }}
        >
          {pct}%
        </span>
      </span>
      <span
        style={{
          display: "block",
          width: "100%",
          height: 5,
          borderRadius: 99,
          background: "rgba(10,10,10,0.07)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${pct}%`,
            borderRadius: 99,
            background: t.ring,
          }}
        />
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: "#8a8a85",
          marginTop: 7,
          display: "block",
        }}
      >
        {count}
      </span>
      {open ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            bottom: -9,
            width: 11,
            height: 11,
            background: "#fff",
            borderLeft: "1px solid #0a0a0a",
            borderTop: "1px solid #0a0a0a",
            transform: "translateX(-50%) rotate(225deg)",
            zIndex: 2,
          }}
        />
      ) : null}
    </button>
  );
}

// Versão compacta da barra, pro carrossel horizontal mobile — sem a
// contagem "X de Y" embaixo (não cabe no cartão estreito, ver mTab no
// design de referência).
function MobileDimTab({
  dim,
  pct,
  open,
  onToggle,
}: {
  dim: DimKey;
  pct: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = SCORE[scoreTier(pct)];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        flex: "0 0 auto",
        minWidth: 124,
        background: "#fafaf6",
        border: `1px solid ${open ? "#0a0a0a" : LINE}`,
        boxShadow: open ? "0 0 0 1px #0a0a0a" : "none",
        borderRadius: 11,
        padding: "9px 11px 10px",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: open ? "#0a0a0a" : "#3a3a38",
            fontWeight: open ? 600 : 400,
          }}
        >
          {DIM_LABEL[dim]}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            marginLeft: "auto",
            color: t.fg,
          }}
        >
          {pct}%
        </span>
      </span>
      <span
        style={{
          display: "block",
          width: "100%",
          height: 5,
          borderRadius: 99,
          background: "rgba(10,10,10,0.07)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${pct}%`,
            borderRadius: 99,
            background: t.ring,
          }}
        />
      </span>
    </button>
  );
}

function DimPanel({
  dim,
  items,
  pct,
  mobile,
}: {
  dim: DimKey;
  items: MatchDetailItem[];
  pct: number;
  mobile?: boolean;
}) {
  const t = SCORE[scoreTier(pct)];
  const found = items.filter((i) => i.ok).length;

  return (
    <div
      style={{
        marginTop: 16,
        background: mobile ? "#fafaf6" : "#fff",
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: mobile ? "13px 14px" : "15px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: mobile ? 11 : 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.15 }}>
          {DIM_TITLE[dim]}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 5,
            color: t.fg,
            background: t.bg,
          }}
        >
          {pct}%
        </span>
        <span
          style={{
            fontSize: mobile ? 11.5 : 12,
            color: "#6a6560",
            marginLeft: mobile ? 0 : "auto",
            textAlign: mobile ? "left" : "right",
            flexBasis: mobile ? "100%" : "auto",
          }}
        >
          {found} de {items.length} no seu CV
        </span>
      </div>

      {items.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((item) => (
            <span
              key={item.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                borderRadius: 7,
                padding: "5px 9px",
                border: item.ok
                  ? "1px solid rgba(34,163,72,0.28)"
                  : "1px solid rgba(10,10,10,0.1)",
                background: item.ok ? "rgba(34,163,72,0.1)" : "#f4f3ee",
                color: item.ok ? "#1f7a34" : "#7a7873",
                fontWeight: item.ok ? 500 : 400,
              }}
            >
              {item.ok ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <title>Presente no CV</title>
                  <path
                    d="M5 12l5 5L20 7"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              {itemLabel(dim, item)}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "#8a8a85", margin: 0 }}>
          Sem dado suficiente da vaga pra comparar essa dimensão.
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 13,
          paddingTop: 11,
          borderTop: `1px solid ${LINE}`,
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: 0.4,
          color: "#8a8a85",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              display: "inline-block",
              background: "rgba(34,163,72,0.35)",
              border: "1px solid rgba(34,163,72,0.5)",
            }}
          />
          presente no CV
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              display: "inline-block",
              background: "#eceae2",
              border: "1px solid rgba(10,10,10,0.12)",
            }}
          />
          não encontrado
        </span>
      </div>
    </div>
  );
}

// Wrapper que anima abrir/fechar sem JS medindo altura: grid-template-rows
// 0fr→1fr é uma técnica CSS pura que funciona com conteúdo de altura
// variável (a técnica de max-height fixo cortaria conteúdo maior ou
// deixaria "buraco" em conteúdo menor). `lastDim` (não `open`) decide o que
// renderizar dentro — assim o conteúdo continua montado durante a animação
// de fechamento em vez de sumir instantaneamente no frame em que `open`
// vira null, o que faria a altura colapsar mas o conteúdo cortar seco.
function AnimatedCollapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 0.28s ease",
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

// Grade de composição do score (área/skills/senioridade/tecnologias),
// clicável — cada barra abre um painel mostrando quais termos da vaga
// bateram com o perfil (verde) e quais não (cinza). Substitui a grade
// estática de MiniBar por uma versão interativa (design: Card Vaga -
// Breakdown Clicavel.html). Client component porque precisa de estado
// local (qual dimensão está aberta) — o resto do card continua Server
// Component.
//
// Duas versões no mesmo componente — grade de 4 colunas no desktop,
// carrossel horizontal no mobile (mesmo design de referência) — alternadas
// por @media query em vez de JS (evita hidration mismatch de detectar
// viewport no client) via classes .score-bd-desktop/.score-bd-mobile.
export function ScoreBreakdownPanel({
  breakdown,
  details,
}: {
  breakdown: MatchBreakdown;
  details: MatchBreakdownDetails;
}) {
  const [open, setOpen] = useState<DimKey | null>(null);
  const [lastDim, setLastDim] = useState<DimKey | null>(null);

  const dims: DimKey[] = ["area", "skills", "seniority", "technologies"];

  const toggle = (dim: DimKey) => {
    if (open === dim) {
      setOpen(null);
      return;
    }
    setLastDim(dim);
    setOpen(dim);
  };

  return (
    <div>
      <style>{`
        .score-bd-desktop { display: block; }
        .score-bd-mobile { display: none; }
        .score-bd-mtabs { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .score-bd-mtabs::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) {
          .score-bd-desktop { display: none; }
          .score-bd-mobile { display: block; }
        }
      `}</style>

      {/* Desktop: grade 4 colunas */}
      <div className="score-bd-desktop">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "18px 0 8px",
            paddingTop: 16,
            borderTop: "1px solid rgba(10,10,10,0.07)",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: "#8a8a85",
            }}
          >
            Composição do score
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "#6a6560",
              marginLeft: "auto",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <title>Dica</title>
              <path
                d="M9 11.5V8.2a3 3 0 116 0v3.3M6 11.5h12v8.3H6z"
                stroke="#8a8a85"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {"clique em uma dimensão para ver os termos encontrados"}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
          }}
        >
          {dims.map((dim) => {
            const items = details[dim];
            const found = items.filter((i) => i.ok).length;
            return (
              <DimBar
                key={dim}
                dim={dim}
                pct={breakdownPct(dim, breakdown[dim])}
                count={`${found} de ${items.length}`}
                open={open === dim}
                onToggle={() => toggle(dim)}
              />
            );
          })}
        </div>
        <AnimatedCollapse open={open !== null}>
          {lastDim ? (
            <DimPanel
              dim={lastDim}
              items={details[lastDim]}
              pct={breakdownPct(lastDim, breakdown[lastDim])}
            />
          ) : null}
        </AnimatedCollapse>
      </div>

      {/* Mobile: carrossel horizontal */}
      <div className="score-bd-mobile">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "14px 0 9px",
            paddingTop: 13,
            borderTop: "1px solid rgba(10,10,10,0.07)",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              color: "#8a8a85",
            }}
          >
            Composição
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#6a6560",
              marginLeft: "auto",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <title>Toque pra detalhar</title>
              <rect
                x="5"
                y="10"
                width="14"
                height="10"
                rx="2"
                stroke="#8a8a85"
                strokeWidth="1.6"
              />
              <path
                d="M8 10V7a4 4 0 0 1 8 0v3"
                stroke="#8a8a85"
                strokeWidth="1.6"
              />
            </svg>
            toque para detalhar
          </span>
        </div>
        <div className="score-bd-mtabs">
          {dims.map((dim) => (
            <MobileDimTab
              key={dim}
              dim={dim}
              pct={breakdownPct(dim, breakdown[dim])}
              open={open === dim}
              onToggle={() => toggle(dim)}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: MONO,
            fontSize: 9.5,
            color: "#8a8a85",
            marginTop: 8,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <title>Arraste</title>
            <path
              d="M5 12h14M14 7l5 5-5 5"
              stroke="#8a8a85"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          arraste para ver as 4 dimensões
        </div>
        <AnimatedCollapse open={open !== null}>
          {lastDim ? (
            <DimPanel
              dim={lastDim}
              items={details[lastDim]}
              pct={breakdownPct(lastDim, breakdown[lastDim])}
              mobile
            />
          ) : null}
        </AnimatedCollapse>
      </div>
    </div>
  );
}
