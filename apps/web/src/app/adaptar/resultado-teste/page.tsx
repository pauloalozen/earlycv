"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";

// ─────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────

const MOCK = {
  vaga: {
    cargo: "Product Manager",
    empresa: "Nubank",
  },

  fit: {
    score: 61,
    headline:
      "Perfil com bases sólidas, mas com lacunas críticas para esta vaga",
    subheadline:
      "Você tem experiência relevante, porém seu CV não comunica isso da forma que o ATS e o recrutador esperam.",
    score_pos_ajustes: 83,
    media_candidatos: 81, // mockado entre 78–85 até termos dados reais
  },

  breakdown: {
    positivos: [
      {
        texto:
          "Comprovou mais de 3 anos liderando gestão de produto em ambiente digital",
        pontos: 12,
      },
      {
        texto:
          "Aplicou metodologias ágeis (Scrum e Kanban) com times de engenharia",
        pontos: 9,
      },
      {
        texto: "Construiu trajetória em empresa do setor financeiro regulado",
        pontos: 8,
      },
      {
        texto:
          "Definiu e acompanhou OKRs e métricas de produto de forma estruturada",
        pontos: 7,
      },
      {
        texto: "Demonstrou fluência em inglês em contextos profissionais",
        pontos: 5,
      },
    ],
    negativos: [
      {
        texto:
          "Não quantificou resultados alcançados (%, R$, número de usuários impactados)",
        pontos: -11,
      },
      {
        texto:
          "Não mencionou ferramentas de dados utilizadas (SQL, Looker, Amplitude)",
        pontos: -9,
      },
      {
        texto:
          "Não evidenciou liderança de squads multidisciplinares com devs e designers",
        pontos: -7,
      },
      {
        texto:
          "Não registrou lançamentos de produto completos do discovery ao go-live",
        pontos: -6,
      },
      {
        texto:
          "Não apresentou experiência com integração de APIs ou produto técnico",
        pontos: -5,
      },
    ],
  },

  ats_keywords: {
    presentes: [
      "Product Manager",
      "Scrum",
      "Kanban",
      "OKRs",
      "roadmap",
      "stakeholders",
      "MVP",
    ],
    ausentes: [
      { kw: "SQL", pontos: 5 },
      { kw: "Amplitude", pontos: 5 },
      { kw: "growth", pontos: 4 },
      { kw: "dados", pontos: 4 },
      { kw: "A/B testing", pontos: 4 },
      { kw: "discovery", pontos: 3 },
      { kw: "squad", pontos: 3 },
      { kw: "fintech", pontos: 3 },
    ],
  },

  formato_cv: {
    ats_score: 54,
    resumo:
      "Seu CV tem problemas de formatação que dificultam a leitura pelos sistemas de triagem automática. Tabelas e colunas múltiplas são frequentemente ignoradas pelos parsers de ATS.",
    problemas: [
      {
        tipo: "critico" as "critico" | "atencao" | "ok",
        titulo: "Layout com múltiplas colunas",
        descricao:
          "Colunas laterais são ignoradas por ~70% dos sistemas ATS. Informações importantes podem ser perdidas na triagem.",
        impacto: -12,
      },
      {
        tipo: "critico" as "critico" | "atencao" | "ok",
        titulo: "Dados de contato incompletos",
        descricao:
          "Perfil do LinkedIn não encontrado. Recrutadores e sistemas de ATS esperam essa informação.",
        impacto: -8,
      },
      {
        tipo: "atencao" as "critico" | "atencao" | "ok",
        titulo: "Organização com tabelas",
        descricao:
          "Tabelas em Word e PDF são mal interpretadas por parsers. Prefira listas simples e hierarquia visual por texto.",
        impacto: -6,
      },
      {
        tipo: "atencao" as "critico" | "atencao" | "ok",
        titulo: "Resumo profissional ausente",
        descricao:
          "Currículos sem sumário inicial perdem pontos em triagens automatizadas que buscam contexto rápido do candidato.",
        impacto: -5,
      },
      {
        tipo: "ok" as "critico" | "atencao" | "ok",
        titulo: "Formato de arquivo compatível",
        descricao:
          "PDF padrão detectado. Compatível com a maioria dos sistemas de recrutamento.",
        impacto: 0,
      },
    ],
    campos: [
      { nome: "Nome completo", presente: true },
      { nome: "E-mail", presente: true },
      { nome: "Telefone", presente: true },
      { nome: "LinkedIn", presente: false },
      { nome: "Localização", presente: true },
      { nome: "Resumo profissional", presente: false },
      { nome: "Formação acadêmica", presente: true },
      { nome: "Experiências com datas", presente: true },
      { nome: "Habilidades e Competências", presente: false },
    ],
  },

  comparacao: {
    antes:
      "Responsável pelo gerenciamento do produto e pela coordenação com os times de desenvolvimento.",
    depois:
      "Liderei o roadmap de produto para 3 squads (18 devs), priorizando funcionalidades com base em dados de uso (Amplitude) e impacto em NPS — resultando em aumento de 22% na retenção mensal em 6 meses.",
  },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  size = 140,
  label,
  dimmed = false,
}: {
  score: number;
  size?: number;
  label?: string;
  dimmed?: boolean;
}) {
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;
  const color = dimmed
    ? "rgba(255,255,255,0.35)"
    : score >= 70
      ? "#84cc16"
      : score >= 40
        ? "#f59e0b"
        : "#ef4444";
  const textColor = dimmed ? "rgba(255,255,255,0.35)" : color;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative score graphic */}
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#ffffff12"
          strokeWidth="7"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeDashoffset={circ * 0.25}
          style={{
            transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={dimmed ? "26" : "30"}
          fontWeight="800"
          fill={textColor}
          fontFamily="inherit"
        >
          {score}
        </text>
      </svg>
      {label && (
        <p
          className={`text-center text-[11px] font-semibold ${dimmed ? "text-white/30" : "text-white/50"}`}
        >
          {label}
        </p>
      )}
    </div>
  );
}

function PointBadge({ pontos }: { pontos: number }) {
  const pos = pontos > 0;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
        pos ? "bg-lime-100 text-lime-700" : "bg-red-100 text-red-700"
      }`}
    >
      {pos ? "+" : ""}
      {pontos}
    </span>
  );
}

function ImpactBar({ pontos, max }: { pontos: number; max: number }) {
  const pct = Math.round((Math.abs(pontos) / max) * 100);
  const pos = pontos > 0;
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${pos ? "bg-lime-400" : "bg-red-400"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AtsScoreBar({ score }: { score: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${score}%`,
          background:
            "linear-gradient(to right, #ef4444 0%, #f59e0b 50%, #84cc16 100%)",
          backgroundSize: "100vw 100%",
          backgroundPosition: "left center",
        }}
      />
    </div>
  );
}

function ProblemaIcon({ tipo }: { tipo: "critico" | "atencao" | "ok" }) {
  if (tipo === "critico")
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">
        !
      </span>
    );
  if (tipo === "atencao")
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-600">
        ~
      </span>
    );
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-100 text-sm font-bold text-lime-600">
      ✓
    </span>
  );
}

function SectionHeader({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="px-1 pb-1 pt-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#AAAAAA]">
        {label}
      </p>
      <h2 className="mt-1 text-lg font-bold text-[#111]">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-[#888]">{description}</p>
      )}
    </div>
  );
}

// Tooltip para keywords ausentes
function KeywordTooltip({ kw, pontos }: { kw: string; pontos: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 ring-1 ring-red-200 transition-colors hover:bg-red-100"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="text-xs font-semibold text-red-700">{kw}</span>
        <span className="rounded bg-red-200 px-1 py-0.5 text-[10px] font-bold text-red-800">
          +{pontos}
        </span>
      </button>

      {open && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#111] px-3 py-2 text-[11px] text-white shadow-lg">
          Adicionar ao CV pode somar{" "}
          <strong className="text-lime-400">+{pontos} pts</strong> ao seu score
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111]" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ResultadoTestePage() {
  const data = MOCK;

  const scoreColor =
    data.fit.score >= 70
      ? "#84cc16"
      : data.fit.score >= 40
        ? "#f59e0b"
        : "#ef4444";

  const maxPos = Math.max(...data.breakdown.positivos.map((p) => p.pontos));
  const maxNeg = Math.max(
    ...data.breakdown.negativos.map((p) => Math.abs(p.pontos)),
  );

  const criticos = data.formato_cv.problemas.filter(
    (p) => p.tipo === "critico",
  );
  const atencoes = data.formato_cv.problemas.filter(
    (p) => p.tipo === "atencao",
  );
  const oks = data.formato_cv.problemas.filter((p) => p.tipo === "ok");
  const camposPresentes = data.formato_cv.campos.filter(
    (c) => c.presente,
  ).length;

  const totalAusentes = data.ats_keywords.ausentes.reduce(
    (s, k) => s + k.pontos,
    0,
  );

  return (
    <PageShell>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[#F0F0F0]"
      />

      <main className="min-h-screen text-[#111]">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 flex items-center justify-between bg-[#F0F0F0]/95 px-8 py-4 backdrop-blur-sm">
          <a
            href="/"
            className="font-logo text-xl font-bold tracking-tight text-[#111]"
          >
            earlyCV
          </a>
          <a
            href="/adaptar/resultado"
            className="text-xs font-medium text-[#888] transition-colors hover:text-[#111]"
          >
            ← versão atual
          </a>
        </header>

        <div className="mx-auto max-w-[1140px] space-y-3 px-6 pb-28 pt-4">
          {/* ── Hero ── */}
          <div className="overflow-hidden rounded-2xl bg-[#111] text-white">
            <div className="flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-evenly">
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/50">
                  Resultado da análise
                </span>
                <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
                  {data.vaga.cargo}
                </h1>
                <p className="mt-1 text-base text-white/50">
                  {data.vaga.empresa}
                </p>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
                  {data.fit.headline}
                </p>

                <div className="mt-6 inline-flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      Score atual
                    </p>
                    <p
                      className="mt-0.5 text-2xl font-bold tabular-nums"
                      style={{ color: scoreColor }}
                    >
                      {data.fit.score}
                    </p>
                  </div>
                  <span className="text-xl text-white/30">→</span>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      Com ajustes
                    </p>
                    <p className="mt-0.5 text-2xl font-bold tabular-nums text-lime-400">
                      {data.fit.score_pos_ajustes}
                    </p>
                  </div>
                  <span className="ml-1 rounded-lg bg-lime-500/20 px-2.5 py-1 text-xs font-bold text-lime-400">
                    +{data.fit.score_pos_ajustes - data.fit.score} pts possíveis
                  </span>
                </div>
              </div>

              {/* ── Painel comparativo de anéis ── */}
              <div className="flex shrink-0 flex-col items-center gap-4">
                {/* Dois anéis */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <ScoreRing
                      score={data.fit.score}
                      size={148}
                      label="Seu score"
                    />
                  </div>

                  <div className="flex flex-col items-center gap-1 px-1">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-white/20">
                      vs
                    </span>
                  </div>

                  <div className="flex flex-col items-center">
                    <ScoreRing
                      score={data.fit.media_candidatos}
                      size={112}
                      label="Média da vaga"
                      dimmed
                    />
                  </div>
                </div>

                {/* Delta de competitividade */}
                {(() => {
                  const delta = data.fit.score - data.fit.media_candidatos;
                  const abaixo = delta < 0;
                  return (
                    <div
                      className={`w-full rounded-xl px-4 py-3 text-center ${
                        abaixo ? "bg-red-500/20" : "bg-lime-500/20"
                      }`}
                    >
                      <p
                        className={`text-2xl font-extrabold tabular-nums ${
                          abaixo ? "text-red-400" : "text-lime-400"
                        }`}
                      >
                        {abaixo ? "" : "+"}
                        {delta} pts
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-white/50">
                        {abaixo
                          ? `abaixo da média dos candidatos`
                          : `acima da média dos candidatos`}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 1 — Experiências e Requisitos
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 1"
            title="Análise de experiências e requisitos"
            description="Como seu perfil se compara ao que a vaga exige, ponto a ponto."
          />

          {/* Card: Pontos positivos */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-100">
                <span className="text-base font-bold text-lime-600">✓</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  O que contribui positivamente
                </p>
                <p className="text-[11px] text-[#999]">
                  pontos do seu perfil que favorecem esta vaga
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-lime-50 px-2.5 py-1 text-xs font-bold text-lime-700">
                +{data.breakdown.positivos.reduce((s, p) => s + p.pontos, 0)}{" "}
                pts
              </span>
            </div>

            <div className="space-y-4">
              {data.breakdown.positivos.map((item) => (
                <div key={item.texto}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-snug text-[#333]">
                      {item.texto}
                    </p>
                    <PointBadge pontos={item.pontos} />
                  </div>
                  <ImpactBar pontos={item.pontos} max={maxPos} />
                </div>
              ))}
            </div>
          </div>

          {/* Card: Pontos negativos */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <span className="text-base font-bold text-red-500">✗</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  O que está reduzindo seu score
                </p>
                <p className="text-[11px] text-[#999]">
                  lacunas identificadas em relação ao que a vaga exige
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                {data.breakdown.negativos.reduce((s, p) => s + p.pontos, 0)} pts
              </span>
            </div>

            <div className="space-y-4">
              {data.breakdown.negativos.map((item) => (
                <div key={item.texto}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-snug text-[#333]">
                      {item.texto}
                    </p>
                    <PointBadge pontos={item.pontos} />
                  </div>
                  <ImpactBar pontos={item.pontos} max={maxNeg} />
                </div>
              ))}
            </div>
          </div>

          {/* Card: Palavras-chave ATS */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
              Palavras-chave para ATS
            </p>
            <p className="mb-5 text-sm text-[#666]">
              Termos que o sistema de triagem desta vaga busca no seu CV.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-bold text-lime-700">
                  <span className="h-2 w-2 rounded-full bg-lime-500" />
                  Presentes no seu CV ({data.ats_keywords.presentes.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.ats_keywords.presentes.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center rounded-full bg-lime-50 px-3 py-1 text-xs font-semibold text-lime-800 ring-1 ring-lime-200"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-bold text-red-600">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Faltando para esta vaga ({data.ats_keywords.ausentes.length})
                  <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    até +{totalAusentes} pts se incluídas
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.ats_keywords.ausentes.map(({ kw, pontos }) => (
                    <KeywordTooltip key={kw} kw={kw} pontos={pontos} />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-[#AAAAAA]">
                  Passe o cursor sobre cada palavra para ver o impacto no score.
                </p>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 2 — Formato do CV atual
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 2"
            title="Análise do formato do seu CV"
            description="Como os sistemas de triagem automática (ATS) leem e interpretam o seu arquivo."
          />

          {/* Card: Score ATS + resumo */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Compatibilidade com ATS
                </p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Capacidade do seu CV de ser lido corretamente por sistemas
                  automatizados
                </p>
              </div>
              <div className="text-right shrink-0">
                <span
                  className="text-2xl font-bold tabular-nums"
                  style={{
                    color:
                      data.formato_cv.ats_score >= 70
                        ? "#84cc16"
                        : data.formato_cv.ats_score >= 40
                          ? "#f59e0b"
                          : "#ef4444",
                  }}
                >
                  {data.formato_cv.ats_score}
                </span>
                <span className="text-base font-normal text-[#CCCCCC]">
                  /100
                </span>
              </div>
            </div>
            <AtsScoreBar score={data.formato_cv.ats_score} />
            <p className="mt-3 text-sm leading-relaxed text-[#666]">
              {data.formato_cv.resumo}
            </p>
          </div>

          {/* Card: Problemas de formato */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[#111]">
                Problemas encontrados
              </p>
              {criticos.length > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  {criticos.length} crítico{criticos.length > 1 ? "s" : ""}
                </span>
              )}
              {atencoes.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  {atencoes.length} atenção
                </span>
              )}
              {oks.length > 0 && (
                <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-bold text-lime-600">
                  {oks.length} ok
                </span>
              )}
            </div>

            <div className="space-y-3">
              {data.formato_cv.problemas.map((p) => (
                <div
                  key={p.titulo}
                  className={`flex gap-3 rounded-xl p-3 ${
                    p.tipo === "critico"
                      ? "bg-red-50"
                      : p.tipo === "atencao"
                        ? "bg-amber-50"
                        : "bg-lime-50"
                  }`}
                >
                  <ProblemaIcon tipo={p.tipo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#111]">
                        {p.titulo}
                      </p>
                      {p.impacto !== 0 && (
                        <span
                          className={`shrink-0 text-[11px] font-bold tabular-nums ${
                            p.impacto > 0 ? "text-lime-600" : "text-red-600"
                          }`}
                        >
                          {p.impacto > 0 ? "+" : ""}
                          {p.impacto} pts
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#666]">
                      {p.descricao}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Campos do CV */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-[#111]">
                Campos do currículo
              </p>
              <span className="text-[11px] font-semibold text-[#AAAAAA]">
                {camposPresentes}/{data.formato_cv.campos.length} encontrados
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.formato_cv.campos.map((campo) => (
                <div
                  key={campo.nome}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                    campo.presente ? "bg-lime-50" : "bg-[#F7F7F7]"
                  }`}
                >
                  <span
                    className={`text-xs font-bold ${
                      campo.presente ? "text-lime-600" : "text-[#CCCCCC]"
                    }`}
                  >
                    {campo.presente ? "✓" : "○"}
                  </span>
                  <span
                    className={`text-xs ${campo.presente ? "text-[#333]" : "text-[#AAAAAA]"}`}
                  >
                    {campo.nome}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Preview antes/depois ── */}
          <SectionHeader
            label="Prévia"
            title="Como seu CV ficará depois da otimização"
            description="Exemplo de como o EarlyCV reescreve uma experiência para passar no ATS e chamar atenção do recrutador."
          />

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#EEEEEE] bg-[#FAFAFA] p-5">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                  Antes
                </p>
                <p className="text-sm leading-relaxed text-[#555]">
                  {data.comparacao.antes}
                </p>
              </div>
              <div className="relative rounded-xl border border-lime-200 bg-lime-50 p-5">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-lime-700">
                  Depois (otimizado)
                </p>
                <p className="text-sm leading-relaxed text-[#1a1a1a] [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]">
                  {data.comparacao.depois}
                </p>
                <div className="absolute inset-0 flex items-end justify-center rounded-xl pb-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-300 bg-white px-3 py-1.5 text-[11px] font-bold text-[#333] shadow-sm">
                    🔒 Disponível após liberar o CV
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── CTA ── */}
          <div className="overflow-hidden rounded-2xl bg-[#111]">
            <div className="p-8 md:p-10">
              <div className="grid gap-8 md:grid-cols-2 md:items-center">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                    Próximo passo
                  </p>
                  <h2 className="mt-2 text-2xl font-bold leading-snug text-white">
                    Seu CV otimizado está pronto
                  </h2>
                  <p className="mt-2 text-sm text-white/60">
                    Use 1 crédito para liberar o CV final — formatado para
                    passar no ATS e pronto para download em PDF e DOCX.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      "CV reescrito com as palavras-chave desta vaga",
                      "Formato validado para sistemas ATS",
                      "Download em PDF e DOCX prontos para enviar",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2.5 text-sm text-white/80"
                      >
                        <span className="text-lime-400">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    style={{ color: "#111" }}
                    className="w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100"
                  >
                    Usar crédito e liberar CV
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white/10 py-4 text-base font-bold leading-none text-white transition-colors hover:bg-white/15"
                  >
                    Ver pacotes de créditos
                  </button>
                  <p className="text-center text-xs text-white/40">
                    Após liberar, os downloads ficam disponíveis imediatamente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
