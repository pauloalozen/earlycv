"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";

// ─────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────

const MOCK = {
  vaga: { cargo: "Product Manager", empresa: "Nubank" },

  fit: {
    score: 61,
    score_pos_ajustes: 83,
    media_candidatos: 81,
    score_minimo_recomendado: 80,
    candidatos_semana: 47,
    headline:
      "Perfil com bases sólidas, mas com lacunas críticas para esta vaga",
  },

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

  ajustes_conteudo: [
    {
      id: "a1",
      titulo: "Quantificar resultados com dados reais",
      descricao:
        "Adicione métricas concretas: %, R$, número de usuários, crescimento.",
      pontos: 11,
      dica: "Ex.: 'Aumentei retenção em 22% em 6 meses via experimentos de onboarding'",
    },
    {
      id: "a2",
      titulo: "Mencionar ferramentas de dados utilizadas",
      descricao:
        "Liste as stacks que você usou: SQL, Looker, Amplitude, Mixpanel.",
      pontos: 9,
      dica: "Ex.: 'Analisei funis de conversão com SQL e Amplitude para priorizar roadmap'",
    },
    {
      id: "a3",
      titulo: "Evidenciar liderança de squads multidisciplinares",
      descricao: "Mostre que liderou times com devs, designers e dados.",
      pontos: 7,
      dica: "Ex.: 'Coordenei squad de 8 pessoas (4 devs, 2 designers, 1 QA, 1 data)'",
    },
    {
      id: "a4",
      titulo: "Registrar lançamentos completos de produto",
      descricao: "Do discovery ao go-live: mostre ciclos completos entregues.",
      pontos: 6,
      dica: "Ex.: 'Conduzi discovery, prototipação e lançamento de feature para 1.2M usuários'",
    },
    {
      id: "a5",
      titulo: "Apresentar experiência com produto técnico ou APIs",
      descricao:
        "Demonstre que consegue trabalhar com times de engenharia em produtos técnicos.",
      pontos: 5,
      dica: "Ex.: 'Defini requisitos de APIs em parceria com o time de backend para integrações B2B'",
    },
  ],

  keywords: {
    presentes: [
      { kw: "Product Manager", pontos: 4 },
      { kw: "Scrum", pontos: 3 },
      { kw: "Kanban", pontos: 3 },
      { kw: "OKRs", pontos: 4 },
      { kw: "roadmap", pontos: 3 },
      { kw: "stakeholders", pontos: 3 },
      { kw: "MVP", pontos: 3 },
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
        tipo: "critico" as const,
        titulo: "Layout com múltiplas colunas",
        descricao:
          "Colunas laterais são ignoradas por ~70% dos sistemas ATS. Informações importantes podem ser perdidas na triagem.",
        impacto: -12,
      },
      {
        tipo: "critico" as const,
        titulo: "Dados de contato incompletos",
        descricao:
          "Perfil do LinkedIn não encontrado. Recrutadores e sistemas de ATS esperam essa informação.",
        impacto: -8,
      },
      {
        tipo: "atencao" as const,
        titulo: "Organização com tabelas",
        descricao:
          "Tabelas em Word e PDF são mal interpretadas por parsers. Prefira listas simples e hierarquia visual por texto.",
        impacto: -6,
      },
      {
        tipo: "atencao" as const,
        titulo: "Resumo profissional ausente",
        descricao:
          "Currículos sem sumário inicial perdem pontos em triagens automatizadas.",
        impacto: -5,
      },
      {
        tipo: "ok" as const,
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

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
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
          fill={dimmed ? "rgba(255,255,255,0.35)" : color}
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

function AjusteRow({
  numero,
  titulo,
  descricao,
  dica,
  pontos,
  concluido = false,
}: {
  numero: number;
  titulo: string;
  descricao: string;
  dica?: string;
  pontos: number;
  concluido?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${concluido ? "bg-lime-50" : "bg-[#F8F8F8]"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            concluido
              ? "bg-lime-200 text-lime-700"
              : "bg-[#E8E8E8] text-[#AAAAAA]"
          }`}
        >
          {concluido ? "✓" : numero}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm font-semibold leading-snug ${concluido ? "text-lime-800" : "text-[#111]"}`}
            >
              {titulo}
            </p>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                concluido
                  ? "bg-lime-200 text-lime-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              +{pontos} pts
            </span>
          </div>
          <p
            className={`mt-0.5 text-xs leading-relaxed ${concluido ? "text-lime-700" : "text-[#666]"}`}
          >
            {descricao}
          </p>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${concluido ? "bg-lime-400" : "bg-[#CCCCCC]"}`}
              style={{ width: concluido ? "100%" : "0%" }}
            />
          </div>
          {!concluido && dica && (
            <p className="mt-2 text-[11px] italic text-[#AAAAAA]">{dica}</p>
          )}
        </div>
      </div>
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

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ResultadoTeste2Page() {
  const data = MOCK;

  // Seleção de keywords ausentes pelo usuário
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);

  const toggleKw = (kw: string) => {
    if (locked) return;
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const ptsKwSelecionadas = data.keywords.ausentes
    .filter((k) => selecionadas.has(k.kw))
    .reduce((s, k) => s + k.pontos, 0);

  const scoreColor =
    data.fit.score >= 70
      ? "#84cc16"
      : data.fit.score >= 40
        ? "#f59e0b"
        : "#ef4444";
  const delta = data.fit.score - data.fit.media_candidatos;
  const ptsFaltamMinimo = data.fit.score_minimo_recomendado - data.fit.score;

  const totalAjustesConteudo = data.ajustes_conteudo.reduce(
    (s, a) => s + a.pontos,
    0,
  );
  const totalKwAusentes = data.keywords.ausentes.reduce(
    (s, k) => s + k.pontos,
    0,
  );
  const totalAjustes =
    data.ajustes_conteudo.length + data.keywords.ausentes.length;

  const maxPos = Math.max(...data.positivos.map((p) => p.pontos));
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
          <div className="flex items-center gap-4">
            <a
              href="/adaptar/resultado-teste"
              className="text-xs font-medium text-[#888] transition-colors hover:text-[#111]"
            >
              ← teste 1
            </a>
            <a
              href="/adaptar/resultado"
              className="text-xs font-medium text-[#888] transition-colors hover:text-[#111]"
            >
              ← versão atual
            </a>
          </div>
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

              <div className="flex shrink-0 flex-col items-center gap-4">
                <div className="flex items-center gap-3">
                  <ScoreRing
                    score={data.fit.score}
                    size={148}
                    label="Seu score"
                  />
                  <span className="px-1 text-[11px] font-bold uppercase tracking-widest text-white/20">
                    vs
                  </span>
                  <ScoreRing
                    score={data.fit.media_candidatos}
                    size={112}
                    label="Média da vaga"
                    dimmed
                  />
                </div>
                <div
                  className={`w-full rounded-xl px-4 py-3 text-center ${delta < 0 ? "bg-red-500/20" : "bg-lime-500/20"}`}
                >
                  <p
                    className={`text-2xl font-extrabold tabular-nums ${delta < 0 ? "text-red-400" : "text-lime-400"}`}
                  >
                    {delta < 0 ? "" : "+"}
                    {delta} pts
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-white/50">
                    {delta < 0
                      ? "abaixo da média dos candidatos"
                      : "acima da média dos candidatos"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Alerta de competição ── */}
          <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <span className="mt-0.5 text-lg leading-none">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {data.fit.candidatos_semana} candidatos já analisaram esta vaga
                nesta semana
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                Vagas como essa recebem centenas de candidaturas. Recrutadores
                priorizam os CVs com maior compatibilidade — e você está{" "}
                {Math.abs(delta)} pts abaixo da média agora.{" "}
                <strong>
                  Seu CV otimizado já está pronto. Cada hora conta.
                </strong>
              </p>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 1 — O que já está a seu favor
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 1"
            title="O que já está a seu favor"
            description="Pontos do seu perfil que contribuem positivamente para esta vaga."
          />

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-100">
                <span className="text-base font-bold text-lime-600">✓</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Pontos fortes identificados
                </p>
                <p className="text-[11px] text-[#999]">
                  contribuem positivamente para o seu score
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-lime-50 px-2.5 py-1 text-xs font-bold text-lime-700">
                +{data.positivos.reduce((s, p) => s + p.pontos, 0)} pts
              </span>
            </div>
            <div className="space-y-4">
              {data.positivos.map((item) => (
                <div key={item.texto}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-snug text-[#333]">
                      {item.texto}
                    </p>
                    <span className="shrink-0 rounded-md bg-lime-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-lime-700">
                      +{item.pontos}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                    <div
                      className="h-full rounded-full bg-lime-400 transition-all duration-500"
                      style={{
                        width: `${Math.round((item.pontos / maxPos) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 2 — O que pode ser melhorado
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 2"
            title="O que pode ser melhorado"
            description="Ajustes identificados no seu CV que aumentam a compatibilidade com esta vaga."
          />

          {/* Banner de pontos em jogo */}
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#111] px-6 py-4 text-white">
            <div>
              <p className="text-sm font-bold">
                {totalAjustes} ajustes identificados no seu CV otimizado
              </p>
              <p className="mt-0.5 text-xs text-white/50">
                Libere o CV para aplicar todos de uma vez e ganhar até{" "}
                <span className="font-bold text-lime-400">
                  +{totalAjustesConteudo + totalKwAusentes} pts
                </span>
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-lime-500/20 px-4 py-2 text-center">
              <span className="block text-xl font-extrabold tabular-nums text-lime-400">
                +{totalAjustesConteudo + totalKwAusentes}
              </span>
              <span className="text-[10px] font-semibold text-lime-400/70">
                pts em jogo
              </span>
            </span>
          </div>

          {/* Ajustes de conteúdo */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <span className="text-base leading-none">🎯</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Ajustes de conteúdo
                </p>
                <p className="text-[11px] text-[#999]">
                  lacunas que o EarlyCV corrige no seu CV otimizado
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                +{totalAjustesConteudo} pts
              </span>
            </div>
            <div className="space-y-3">
              {data.ajustes_conteudo.map((a, i) => (
                <AjusteRow
                  key={a.id}
                  numero={i + 1}
                  titulo={a.titulo}
                  descricao={a.descricao}
                  dica={a.dica}
                  pontos={a.pontos}
                  concluido={false}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
              <span className="text-sm">🔒</span>
              <p className="text-xs font-semibold text-amber-800">
                Libere seu CV otimizado para aplicar todos os{" "}
                {data.ajustes_conteudo.length} ajustes de conteúdo
                automaticamente.
              </p>
            </div>
          </div>

          {/* Palavras-chave da vaga */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <span className="text-base leading-none">🔑</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Palavras-chave da vaga
                </p>
                <p className="text-[11px] text-[#999]">
                  termos que o ATS desta vaga busca no seu CV
                </p>
              </div>
              <span className="ml-auto rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                +{totalKwAusentes} pts disponíveis
              </span>
            </div>

            {/* Presentes */}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-lime-600">
              Já no seu CV ({data.keywords.presentes.length})
            </p>
            <div className="mb-5 space-y-2">
              {data.keywords.presentes.map((k) => (
                <AjusteRow
                  key={k.kw}
                  numero={0}
                  titulo={k.kw}
                  descricao="Palavra-chave identificada no seu currículo."
                  pontos={k.pontos}
                  concluido
                />
              ))}
            </div>

            {/* Faltando — selecionáveis */}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-600">
              Faltando no seu CV ({data.keywords.ausentes.length})
            </p>
            <p className="mb-3 text-xs text-[#888]">
              Selecione quais você deseja incluir. Seu CV otimizado só
              adicionará as que você aprovar.
            </p>

            <div className="space-y-2">
              {data.keywords.ausentes.map((k) => {
                const sel = selecionadas.has(k.kw);
                return (
                  <label
                    key={k.kw}
                    className={`flex items-center gap-3 rounded-xl p-3.5 transition-colors ${
                      locked ? "cursor-default" : "cursor-pointer"
                    } ${
                      sel
                        ? "bg-lime-50 ring-1 ring-lime-300"
                        : "bg-red-50 hover:bg-red-100 ring-1 ring-red-200"
                    }`}
                  >
                    {/* Checkbox customizado */}
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        sel
                          ? "border-lime-500 bg-lime-500"
                          : "border-red-300 bg-white"
                      }`}
                    >
                      {sel && (
                        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative checkbox tick
                        <svg
                          width="10"
                          height="8"
                          viewBox="0 0 10 8"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M1 4l3 3 5-6"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={sel}
                      onChange={() => toggleKw(k.kw)}
                    />

                    <span
                      className={`flex-1 text-sm font-semibold ${sel ? "text-lime-800" : "text-red-700"}`}
                    >
                      {k.kw}
                    </span>

                    {/* Barra de progresso */}
                    <div className="w-20 shrink-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${sel ? "bg-lime-400" : "bg-red-300"}`}
                          style={{ width: sel ? "100%" : "0%" }}
                        />
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                        sel
                          ? "bg-lime-200 text-lime-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      +{k.pontos} pts
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Resumo da seleção */}
            {selecionadas.size > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-lime-50 px-4 py-3 ring-1 ring-lime-200">
                <div>
                  <p className="text-sm font-bold text-lime-800">
                    {selecionadas.size} palavra
                    {selecionadas.size > 1 ? "s" : ""}-chave selecionada
                    {selecionadas.size > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-lime-600">
                    Serão incluídas no seu CV otimizado ao liberar
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-lime-200 px-3 py-1.5 text-sm font-extrabold text-lime-800">
                  +{ptsKwSelecionadas} pts
                </span>
              </div>
            )}

            {selecionadas.size === 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
                <span className="text-sm">🔒</span>
                <p className="text-xs font-semibold text-amber-800">
                  Selecione as palavras-chave que deseja incluir e libere seu CV
                  otimizado.
                </p>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════
              SEÇÃO 3 — Formato do CV
          ════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Seção 3"
            title="Análise do formato do seu CV"
            description="Como os sistemas de triagem automática (ATS) leem e interpretam o seu arquivo."
          />

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#111]">
                  Compatibilidade com ATS
                </p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Capacidade do CV de ser lido corretamente por sistemas
                  automatizados
                </p>
              </div>
              <div className="shrink-0 text-right">
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
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${data.formato_cv.ats_score}%`,
                  background:
                    "linear-gradient(to right, #ef4444 0%, #f59e0b 50%, #84cc16 100%)",
                  backgroundSize: "100vw 100%",
                  backgroundPosition: "left center",
                }}
              />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#666]">
              {data.formato_cv.resumo}
            </p>
          </div>

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
                  className={`flex gap-3 rounded-xl p-3 ${p.tipo === "critico" ? "bg-red-50" : p.tipo === "atencao" ? "bg-amber-50" : "bg-lime-50"}`}
                >
                  <ProblemaIcon tipo={p.tipo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#111]">
                        {p.titulo}
                      </p>
                      {p.impacto !== 0 && (
                        <span
                          className={`shrink-0 text-[11px] font-bold tabular-nums ${p.impacto > 0 ? "text-lime-600" : "text-red-600"}`}
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
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${campo.presente ? "bg-lime-50" : "bg-[#F7F7F7]"}`}
                >
                  <span
                    className={`text-xs font-bold ${campo.presente ? "text-lime-600" : "text-[#CCCCCC]"}`}
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

          {/* ── Preview ── */}
          <SectionHeader
            label="Prévia"
            title="Como seu CV ficará depois da otimização"
            description="Veja como o EarlyCV reescreve uma experiência para passar no ATS e chamar atenção do recrutador."
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
          <div className="overflow-hidden rounded-2xl bg-[#0E0E0E]">
            <div className="flex items-center gap-3 bg-red-600/90 px-6 py-3">
              <span className="text-sm">⚡</span>
              <p className="text-sm font-bold text-white">
                Você está a {ptsFaltamMinimo} pts do score mínimo recomendado
                para ser chamado para entrevista
              </p>
            </div>

            <div className="p-8 md:p-10">
              <div className="grid gap-8 md:grid-cols-2 md:items-start">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                    Não deixe para depois
                  </p>
                  <h2 className="mt-2 text-2xl font-bold leading-snug text-white">
                    Seu CV otimizado já está pronto — falta só você liberar
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Enquanto você decide, outros candidatos já estão enviando
                    CVs otimizados para esta mesma vaga. Candidatos com score
                    acima de 80 têm{" "}
                    <span className="font-bold text-white/90">
                      3× mais chances de ser chamados para entrevista.
                    </span>
                  </p>

                  <div className="mt-5 rounded-xl bg-white/8 p-4">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-white/40">Seu score atual</span>
                      <span className="text-white/40">Score recomendado</span>
                    </div>
                    <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-amber-400"
                        style={{ width: `${data.fit.score}%` }}
                      />
                      <div
                        className="absolute inset-y-0 w-0.5 bg-lime-400"
                        style={{
                          left: `${data.fit.score_minimo_recomendado}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className="text-lg font-extrabold tabular-nums"
                        style={{ color: scoreColor }}
                      >
                        {data.fit.score}
                      </span>
                      <span className="rounded-md bg-lime-500/20 px-2 py-0.5 text-xs font-bold text-lime-400">
                        meta: {data.fit.score_minimo_recomendado}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-5 space-y-2.5">
                    {[
                      `${data.ajustes_conteudo.length} ajustes de conteúdo prontos para aplicar`,
                      `${selecionadas.size > 0 ? selecionadas.size : data.keywords.ausentes.length} palavras-chave da vaga inseridas no contexto certo`,
                      "Formato validado para sistemas ATS — sem colunas, sem tabelas",
                      "Download em PDF e DOCX prontos para enviar hoje",
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

                <div className="flex flex-col gap-3 md:pt-2">
                  <div className="rounded-xl bg-lime-500/15 px-5 py-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-lime-400/70">
                      Seu score após liberar
                    </p>
                    <p className="mt-1 text-4xl font-extrabold tabular-nums text-lime-400">
                      {Math.min(
                        data.fit.score_pos_ajustes + ptsKwSelecionadas,
                        100,
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      acima do score recomendado de{" "}
                      {data.fit.score_minimo_recomendado}
                      {ptsKwSelecionadas > 0 &&
                        " · inclui palavras-chave selecionadas"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLocked(true)}
                    style={{ color: "#0E0E0E" }}
                    className="w-full rounded-xl bg-white py-4 text-base font-bold leading-none transition-colors hover:bg-stone-100"
                  >
                    Liberar meu CV otimizado agora
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white/10 py-3.5 text-sm font-bold leading-none text-white/70 transition-colors hover:bg-white/15"
                  >
                    Ver pacotes de créditos
                  </button>
                  <p className="text-center text-xs text-white/30">
                    Após liberar, os {totalAjustes} ajustes são aplicados
                    automaticamente.
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
