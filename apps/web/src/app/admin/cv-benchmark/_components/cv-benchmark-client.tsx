"use client";

import { useRef, useState } from "react";
import { AT } from "@/app/admin/_components/admin-primitives";

// ─── Types ───────────────────────────────────────────────────────────────────

type AjusteRef = {
  id: string;
  titulo: string;
  categoria: "keywords_incluidas" | "texto_reescrito" | "ajuste_conteudo";
};

type CvAnalysisOutput = {
  fit: { score: number; score_pos_ajustes: number; categoria: string };
  vaga?: { cargo?: string; empresa?: string };
  keywords?: {
    ausentes?: Array<{ kw: string; pontos: number }>;
    presentes?: Array<{ kw: string; pontos: number }>;
    possiveis?: Array<{ kw: string; pontos: number }>;
  };
  ajustes_conteudo?: Array<AjusteRef & { descricao?: string; pontos?: number }>;
  requirements?: unknown[];
  [key: string]: unknown;
};

type CvAdaptationOutput = {
  summary: string;
  sections: unknown[];
  [key: string]: unknown;
};

type CaseStep =
  | "parsed"
  | "analyzing"
  | "analyzed"
  | "adapting"
  | "adapted"
  | "reanalyzing"
  | "done";

type StepError = { step: string; message: string };

type BatchCase = {
  id: string;
  cvFileName: string;
  cvFile: File;
  jobText: string;
  step: CaseStep;
  errors: StepError[];
  // Accumulated per stage
  cvText?: string;
  analysisOutput?: CvAnalysisOutput;
  analysisModel?: string;
  analysisPromptVersion?: string;
  selectedKeywords: string[];
  adaptationPayload?: unknown;
  adaptedCv?: CvAdaptationOutput;
  adaptedCvText?: string;
  adaptedCvAudit?: unknown;
  // Reanalysis: deterministic (idêntico ao produto — keyword encontrada = pontos)
  reanalysisFoundKeywords?: string[];
  reanalysisMissingKeywords?: string[];
  reanalysisScoreAfter?: number;
  kwExpanded?: boolean;
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function isTextCvFile(fileName: string): boolean {
  return /^cv\.(txt|md)$/i.test(fileName);
}

async function parseFolderBatch(files: FileList): Promise<BatchCase[]> {
  const groups = new Map<string, { cvFile?: File; vagaFile?: File }>();

  for (const file of Array.from(files)) {
    const lower = file.name.toLowerCase();

    // Avulso pattern checked by filename first, regardless of folder depth:
    // 001-cv.txt, 001-cv.md, 001-vaga.txt, 001-vaga.md
    const avulso = file.name.match(/^(\d+)-(cv\.(txt|md)|vaga\.(txt|md))$/i);
    if (avulso) {
      const caseId = avulso[1];
      if (!groups.has(caseId)) groups.set(caseId, {});
      const g = groups.get(caseId)!;
      if (lower.includes("-cv.")) g.cvFile = file;
      else g.vagaFile = file;
      continue;
    }

    // Folder structure: case-001/cv.txt (or cv.md, vaga.txt, vaga.md)
    const parts = file.webkitRelativePath
      ? file.webkitRelativePath.split("/")
      : [file.name];
    if (parts.length >= 2) {
      const caseId = parts[parts.length - 2];
      const fileName = parts[parts.length - 1].toLowerCase();
      if (!groups.has(caseId)) groups.set(caseId, {});
      const g = groups.get(caseId)!;
      if (isTextCvFile(fileName)) g.cvFile = file;
      else if (fileName === "vaga.txt" || fileName === "vaga.md")
        g.vagaFile = file;
    }
  }

  const cases: BatchCase[] = [];
  const sortedIds = Array.from(groups.keys()).sort();

  for (const caseId of sortedIds) {
    const { cvFile, vagaFile } = groups.get(caseId)!;
    if (!cvFile || !vagaFile) continue;
    const [cvText, jobText] = await Promise.all([
      cvFile.text(),
      vagaFile.text(),
    ]);
    cases.push({
      id: caseId,
      cvFileName: cvFile.name,
      cvFile,
      jobText,
      step: "parsed", // texto já disponível, sem necessidade de parse via API
      cvText,
      errors: [],
      selectedKeywords: [],
    });
  }

  return cases;
}

async function runConcurrently(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      await tasks[idx]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );
}

async function callApi<T>(path: string, body: unknown | FormData): Promise<T> {
  const isFormData = body instanceof FormData;
  const res = await fetch(path, {
    method: "POST",
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    body: isFormData ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function normalizeForSearch(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function computeReanalysis(c: BatchCase): {
  scoreAfter: number;
  foundKeywords: string[];
  missingKeywords: string[];
} {
  const adaptedNorm = normalizeForSearch(c.adaptedCvText ?? "");
  const kwAusentes = c.analysisOutput?.keywords?.ausentes ?? [];
  // Parte do score_pos_ajustes (promessa dos ajustes de conteúdo), igual ao produto
  let scoreAfter =
    c.analysisOutput?.fit?.score_pos_ajustes ??
    c.analysisOutput?.fit?.score ??
    0;
  const foundKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of c.selectedKeywords) {
    const kwData = kwAusentes.find((k) => k.kw === kw);
    const pontos = kwData?.pontos ?? 0;
    if (adaptedNorm.includes(normalizeForSearch(kw))) {
      scoreAfter += pontos;
      foundKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  return {
    scoreAfter: Math.min(scoreAfter, 100),
    foundKeywords,
    missingKeywords,
  };
}

function buildExportJson(cases: BatchCase[]) {
  return {
    exportedAt: new Date().toISOString(),
    cases: cases.map((c) => {
      const scoreBefore = c.analysisOutput?.fit?.score ?? null;
      const scoreProjected = c.analysisOutput?.fit?.score_pos_ajustes ?? null;
      const scoreAfter = c.reanalysisScoreAfter ?? null;
      const drift =
        scoreAfter !== null
          ? scoreProjected !== null
            ? scoreAfter - scoreProjected
            : scoreBefore !== null
              ? scoreAfter - scoreBefore
              : null
          : null;
      const driftBasis =
        drift !== null
          ? scoreProjected !== null
            ? "vs_esperado"
            : "vs_antes"
          : null;

      return {
        id: c.id,
        input: {
          cvFileName: c.cvFileName,
          cvText: c.cvText ?? null,
          jobText: c.jobText,
        },
        analysis: c.analysisOutput
          ? {
              payload: { cvText: c.cvText, jobText: c.jobText },
              output: c.analysisOutput,
              scoreBefore,
              scoreProjected,
              model: c.analysisModel ?? null,
              promptVersion: c.analysisPromptVersion ?? null,
            }
          : null,
        selectedKeywords: c.selectedKeywords,
        adaptation: c.adaptedCv
          ? {
              payload: c.adaptationPayload,
              output: c.adaptedCv,
              adaptedCvText: c.adaptedCvText ?? null,
              audit: c.adaptedCvAudit,
            }
          : null,
        reanalysis:
          c.reanalysisScoreAfter !== undefined
            ? {
                mode: "deterministic",
                scoreAfter,
                foundKeywords: c.reanalysisFoundKeywords ?? [],
                missingKeywords: c.reanalysisMissingKeywords ?? [],
                drift,
                driftBasis,
              }
            : null,
        errors: c.errors.reduce<Record<string, string>>((acc, e) => {
          acc[e.step] = e.message;
          return acc;
        }, {}),
      };
    }),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const CONCURRENCY = 3;

export function CvBenchmarkClient() {
  const [cases, setCases] = useState<BatchCase[]>([]);
  const [importing, setImporting] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  function updateCase(id: string, patch: Partial<BatchCase>) {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setImporting(true);
    try {
      const parsed = await parseFolderBatch(files);
      if (!parsed.length) {
        alert(
          "Nenhum par válido encontrado.\n\nEstrutura esperada:\n  case-001/cv.txt (ou cv.md) + case-001/vaga.txt\n\nOu avulso:\n  001-cv.txt + 001-vaga.txt",
        );
        return;
      }
      setCases(parsed);
    } finally {
      setImporting(false);
    }
  }

  // ── Analyze ───────────────────────────────────────────────────────────────

  async function analyzeCase(c: BatchCase) {
    if (!c.cvText) return;
    updateCase(c.id, { step: "analyzing" });
    try {
      const result = await callApi<{
        analysisOutput: CvAnalysisOutput;
        canonicalJobJson: unknown;
        model: string;
        promptVersion: string;
      }>("/api/admin/cv-benchmark/analyze", {
        cvText: c.cvText,
        jobText: c.jobText,
      });
      updateCase(c.id, {
        step: "analyzed",
        analysisOutput: result.analysisOutput,
        analysisModel: result.model,
        analysisPromptVersion: result.promptVersion,
      });
    } catch (err) {
      updateCase(c.id, {
        step: "parsed",
        errors: [...c.errors, { step: "analyze", message: String(err) }],
      });
    }
  }

  async function analyzeAll() {
    const targets = cases.filter((c) => c.step === "parsed");
    await runConcurrently(
      targets.map((c) => () => analyzeCase(c)),
      CONCURRENCY,
    );
  }

  // ── Adapt ─────────────────────────────────────────────────────────────────

  async function adaptCase(c: BatchCase) {
    if (!c.cvText || !c.analysisOutput) return;

    const analysis = c.analysisOutput;
    const requirements = (analysis.requirements ?? []) as unknown[];
    const ajustesConteudo = (analysis.ajustes_conteudo ?? [])
      .filter((a) => a.id && a.categoria)
      .map((a) => ({ id: a.id, titulo: a.titulo, categoria: a.categoria }));
    const jobTitle = analysis.vaga?.cargo ?? undefined;
    const companyName = analysis.vaga?.empresa ?? undefined;

    const payload = {
      cvText: c.cvText,
      jobText: c.jobText,
      selectedKeywords: c.selectedKeywords,
      requirements,
      ajustesConteudo,
      jobTitle,
      companyName,
    };

    updateCase(c.id, { step: "adapting", adaptationPayload: payload });
    try {
      const result = await callApi<{
        adaptedCv: CvAdaptationOutput;
        adaptedCvText: string;
        audit: unknown;
      }>("/api/admin/cv-benchmark/adapt", payload);

      updateCase(c.id, {
        step: "adapted",
        adaptedCv: result.adaptedCv,
        adaptedCvText: result.adaptedCvText,
        adaptedCvAudit: result.audit,
      });
    } catch (err) {
      updateCase(c.id, {
        step: "analyzed",
        errors: [...c.errors, { step: "adapt", message: String(err) }],
      });
    }
  }

  async function adaptAll() {
    const targets = cases.filter((c) => c.step === "analyzed");
    await runConcurrently(
      targets.map((c) => () => adaptCase(c)),
      CONCURRENCY,
    );
  }

  // ── Reanalyze (determinístico — idêntico ao produto) ─────────────────────
  // Keyword encontrada no adaptedCvText = pontos creditados. Sem call de LLM.

  function reanalyzeCase(c: BatchCase) {
    if (!c.adaptedCvText || !c.analysisOutput) return;
    updateCase(c.id, { step: "reanalyzing" });
    const { scoreAfter, foundKeywords, missingKeywords } = computeReanalysis(c);
    updateCase(c.id, {
      step: "done",
      reanalysisScoreAfter: scoreAfter,
      reanalysisFoundKeywords: foundKeywords,
      reanalysisMissingKeywords: missingKeywords,
    });
  }

  function reanalyzeAll() {
    for (const c of cases.filter((c) => c.step === "adapted")) {
      reanalyzeCase(c);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  function exportJson() {
    const data = buildExportJson(cases);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cv-benchmark-${new Date().toISOString().slice(0, 16).replace("T", "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── KW selection ──────────────────────────────────────────────────────────

  function toggleKw(caseId: string, kw: string) {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const has = c.selectedKeywords.includes(kw);
        return {
          ...c,
          selectedKeywords: has
            ? c.selectedKeywords.filter((k) => k !== kw)
            : [...c.selectedKeywords, kw],
        };
      }),
    );
  }

  function toggleKwExpanded(caseId: string) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId ? { ...c, kwExpanded: !c.kwExpanded } : c,
      ),
    );
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasParsed = cases.some((c) => c.step === "parsed");
  const hasAnalyzed = cases.some((c) => c.step === "analyzed");
  const hasAdapted = cases.some((c) => c.step === "adapted");
  const hasDone = cases.some((c) => c.step === "done");
  const busy = cases.some((c) => ["analyzing", "adapting"].includes(c.step));

  // ── Render ────────────────────────────────────────────────────────────────

  const btnBase: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${AT.border}`,
    background: AT.card,
    color: AT.ink2,
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: AT.ink2,
    color: AT.bg,
    border: "none",
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  function Btn({
    onClick,
    disabled,
    primary,
    children,
  }: {
    onClick?: () => void;
    disabled?: boolean;
    primary?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <button
        disabled={disabled || busy}
        onClick={onClick}
        style={disabled || busy ? btnDisabled : primary ? btnPrimary : btnBase}
        type="button"
      >
        {children}
      </button>
    );
  }

  const stepLabel: Record<CaseStep, string> = {
    parsed: "pronto p/ análise",
    analyzing: "analisando…",
    analyzed: "analisado",
    adapting: "gerando CV…",
    adapted: "CV gerado",
    reanalyzing: "reanalisando…",
    done: "concluído",
  };

  const stepColor: Record<CaseStep, string> = {
    parsed: AT.ok,
    analyzing: AT.warn,
    analyzed: AT.ok,
    adapting: AT.warn,
    adapted: AT.ok,
    reanalyzing: AT.warn,
    done: "#5a8f4a",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Upload area ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: AT.card,
          border: `1px solid ${AT.border}`,
          borderRadius: 10,
          padding: 20,
        }}
      >
        <div
          style={{
            fontFamily: '"Geist Mono", monospace',
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: AT.muted2,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          IMPORTAR LOTE
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Btn onClick={() => folderInputRef.current?.click()} primary>
            {importing ? "Importando…" : "Selecionar pasta"}
          </Btn>
          <Btn onClick={() => filesInputRef.current?.click()}>
            {importing ? "Importando…" : "Selecionar arquivos avulsos"}
          </Btn>

          {cases.length > 0 && (
            <span style={{ fontSize: 12, color: AT.muted }}>
              {cases.length} caso(s) importado(s)
            </span>
          )}

          {/* Folder picker */}
          <input
            accept=".txt,.md"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            ref={folderInputRef}
            style={{ display: "none" }}
            type="file"
            // @ts-expect-error – webkitdirectory não existe no tipo TS padrão mas funciona no browser
            webkitdirectory=""
          />
          {/* Avulso picker — sem webkitdirectory */}
          <input
            accept=".txt,.md"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            ref={filesInputRef}
            style={{ display: "none" }}
            type="file"
          />
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: AT.muted2,
            fontFamily: '"Geist Mono", monospace',
          }}
        >
          Pasta: subpastas case-001/ … contendo cv.txt (ou cv.md) + vaga.txt
          {" · "}
          Avulso: 001-cv.txt + 001-vaga.txt (selecione todos de uma vez)
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      {cases.length > 0 && (
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            padding: "14px 20px",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Btn disabled={!hasParsed} onClick={analyzeAll}>
            Analisar ({cases.filter((c) => c.step === "parsed").length})
          </Btn>
          <Btn disabled={!hasAnalyzed} onClick={adaptAll}>
            Gerar CVs ({cases.filter((c) => c.step === "analyzed").length})
          </Btn>
          <Btn disabled={!hasAdapted} onClick={reanalyzeAll}>
            Reanalisar ({cases.filter((c) => c.step === "adapted").length})
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn
            disabled={!hasDone && !hasAdapted && !hasAnalyzed}
            onClick={exportJson}
            primary
          >
            Exportar JSON
          </Btn>
        </div>
      )}

      {/* ── Cases table ─────────────────────────────────────────────────── */}
      {cases.length > 0 && (
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "80px 140px 1fr 70px 70px 70px",
              padding: "10px 16px",
              borderBottom: `1px solid ${AT.border}`,
              fontFamily: '"Geist Mono", monospace',
              fontSize: 10,
              letterSpacing: 1,
              color: AT.muted2,
              fontWeight: 600,
            }}
          >
            <span>ID</span>
            <span>ARQUIVO</span>
            <span>STATUS</span>
            <span>ANTES</span>
            <span>DEPOIS</span>
            <span>DRIFT</span>
          </div>

          {cases.map((c) => {
            const scoreBefore = c.analysisOutput?.fit?.score ?? null;
            const scoreProjected =
              c.analysisOutput?.fit?.score_pos_ajustes ?? null;
            const scoreAfter = c.reanalysisScoreAfter ?? null;
            const drift =
              scoreAfter !== null
                ? scoreProjected !== null
                  ? scoreAfter - scoreProjected
                  : scoreBefore !== null
                    ? scoreAfter - scoreBefore
                    : null
                : null;
            const driftTitle =
              drift !== null
                ? scoreProjected !== null
                  ? `vs score esperado (${scoreProjected})`
                  : `vs score inicial (${scoreBefore})`
                : undefined;
            const ausentes = c.analysisOutput?.keywords?.ausentes ?? [];
            const hasErrors = c.errors.length > 0;

            return (
              <div key={c.id}>
                {/* Main row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 140px 1fr 70px 70px 70px",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${AT.borderSoft}`,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Geist Mono", monospace',
                      fontSize: 12,
                      color: AT.ink2,
                      fontWeight: 600,
                    }}
                  >
                    {c.id}
                  </span>

                  <span
                    style={{
                      fontSize: 11,
                      color: AT.muted,
                      fontFamily: '"Geist Mono", monospace',
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.cvFileName}
                  >
                    {c.cvFileName}
                  </span>

                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: stepColor[c.step],
                        fontFamily: '"Geist Mono", monospace',
                      }}
                    >
                      {stepLabel[c.step]}
                    </span>

                    {c.step === "analyzed" && ausentes.length > 0 && (
                      <button
                        onClick={() => toggleKwExpanded(c.id)}
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: `1px solid ${AT.border}`,
                          background: "transparent",
                          color: AT.muted,
                          cursor: "pointer",
                        }}
                        type="button"
                      >
                        {c.kwExpanded
                          ? "fechar KWs"
                          : `selecionar KWs (${ausentes.length})`}
                      </button>
                    )}

                    {hasErrors && (
                      <span
                        style={{
                          fontSize: 10,
                          color: AT.warn,
                          fontFamily: '"Geist Mono", monospace',
                        }}
                        title={c.errors
                          .map((e) => `${e.step}: ${e.message}`)
                          .join("\n")}
                      >
                        ⚠ {c.errors.length} erro(s)
                      </span>
                    )}
                  </div>

                  <ScoreCell value={scoreBefore} />
                  <ScoreCell value={scoreAfter} />
                  <DriftCell title={driftTitle} value={drift} />
                </div>

                {/* KW selection panel */}
                {c.step === "analyzed" &&
                  c.kwExpanded &&
                  ausentes.length > 0 && (
                    <div
                      style={{
                        padding: "12px 16px 14px 80px",
                        borderBottom: `1px solid ${AT.borderSoft}`,
                        background: AT.bg,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10.5,
                          color: AT.muted2,
                          fontFamily: '"Geist Mono", monospace',
                          marginBottom: 8,
                          letterSpacing: 0.8,
                        }}
                      >
                        KEYWORDS AUSENTES — selecione as que deseja incluir
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {ausentes.map((kwItem) => {
                          const selected = c.selectedKeywords.includes(
                            kwItem.kw,
                          );
                          return (
                            <label
                              key={kwItem.kw}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "4px 10px",
                                borderRadius: 4,
                                border: `1px solid ${selected ? AT.ink2 : AT.border}`,
                                background: selected ? AT.ink2 : "transparent",
                                cursor: "pointer",
                                fontSize: 12,
                                color: selected ? AT.bg : AT.ink2,
                                fontFamily: '"Geist Mono", monospace',
                              }}
                            >
                              <input
                                checked={selected}
                                onChange={() => toggleKw(c.id, kwItem.kw)}
                                style={{ display: "none" }}
                                type="checkbox"
                              />
                              {kwItem.kw}
                              <span
                                style={{
                                  fontSize: 10,
                                  color: selected ? AT.bg : AT.muted2,
                                  marginLeft: 2,
                                }}
                              >
                                +{kwItem.pontos}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {c.selectedKeywords.length > 0 && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: AT.ok,
                            fontFamily: '"Geist Mono", monospace',
                          }}
                        >
                          {c.selectedKeywords.length} keyword(s) selecionada(s)
                        </div>
                      )}
                    </div>
                  )}

                {/* Error panel */}
                {hasErrors &&
                  c.errors.map((e) => (
                    <div
                      key={`${e.step}-${e.message.slice(0, 20)}`}
                      style={{
                        padding: "8px 16px 8px 80px",
                        borderBottom: `1px solid ${AT.borderSoft}`,
                        background: "#fff8f0",
                        fontSize: 11,
                        color: AT.warn,
                        fontFamily: '"Geist Mono", monospace',
                      }}
                    >
                      [{e.step}] {e.message}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {cases.length === 0 && (
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            padding: 40,
            textAlign: "center",
            color: AT.muted2,
            fontSize: 13,
          }}
        >
          Importe uma pasta com pares de CV + vaga para começar.
        </div>
      )}
    </div>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null)
    return (
      <span
        style={{
          fontSize: 12,
          color: AT.muted2,
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        —
      </span>
    );
  const color = value >= 70 ? AT.ok : value >= 45 ? AT.warn : "#c04040";
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color,
        fontFamily: '"Geist", sans-serif',
      }}
    >
      {value}
    </span>
  );
}

function DriftCell({ value, title }: { value: number | null; title?: string }) {
  if (value === null)
    return (
      <span
        style={{
          fontSize: 12,
          color: AT.muted2,
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        —
      </span>
    );
  const color = value > 0 ? AT.ok : value < 0 ? "#c04040" : AT.muted2;
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color,
        fontFamily: '"Geist", sans-serif',
      }}
      title={title}
    >
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
