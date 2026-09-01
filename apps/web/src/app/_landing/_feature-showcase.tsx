"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BrowserChrome,
  browserFrame,
  GEIST,
  MONO,
  SERIF_ITALIC,
} from "./_shared";

const ORANGE = "#e08a4c";
const LIME = "#c6ff3a";
const LIME_DEEP = "#405410";
const BLUE = "#5da0e8";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const GRAY = "#8a8a85";
const BORDER = "rgba(10,10,10,0.08)";

function ScoreRing({
  value,
  size = 84,
  color,
  dark = true,
}: {
  value: number;
  size?: number;
  color: string;
  dark?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(${color} ${pct * 3.6}deg, ${
          dark ? "rgba(255,255,255,0.12)" : "rgba(10,10,10,0.08)"
        } 0deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size - 12,
          height: size - 12,
          borderRadius: "50%",
          background: dark ? "#0a0a0a" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: size * 0.34,
            fontWeight: 700,
            color: dark ? "#fff" : "#0a0a0a",
            fontFamily: GEIST,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        color: "#3a3a36",
        background: "rgba(10,10,10,0.05)",
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: "3px 7px",
      }}
    >
      {children}
    </span>
  );
}

/** Same wordmark + icon used in the real app header (PublicNav) — for mockups that show a nav bar. */
function LogoMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg
        width="17"
        height="17"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <title>earlyCV</title>
        <rect x="0" y="0" width="12" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="16" y="0" width="12" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill="#0a0a0a" />
        <rect
          x="26"
          y="33.5"
          width="9"
          height="6.5"
          rx="2"
          fill="rgba(10,10,10,0.14)"
        />
      </svg>
      <span style={{ fontSize: 15, letterSpacing: -0.6, lineHeight: 1 }}>
        <span style={{ fontWeight: 300 }}>early</span>
        <span style={{ fontWeight: 700 }}>CV</span>
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9,
          color: GRAY,
          border: "1px solid #d8d6ce",
          borderRadius: 3,
          padding: "1px 5px",
          fontWeight: 500,
        }}
      >
        v2.1
      </span>
    </div>
  );
}

/** Fade-out at the bottom of a clipped preview + a CTA driving to the real, full feature. */
function FadeCta({
  maxHeight,
  href,
  label,
  children,
  className,
}: {
  maxHeight: number;
  href: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div>
      <div
        className={className}
        style={{ position: "relative", maxHeight, overflow: "hidden" }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 130,
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0), #fff 78%)",
            pointerEvents: "none",
          }}
        />
      </div>
      <div style={{ textAlign: "center", padding: "16px 0 28px" }}>
        <Link
          href={href}
          style={{
            fontFamily: GEIST,
            fontSize: 13,
            fontWeight: 500,
            color: "#0a0a0a",
            textDecoration: "underline",
            textDecorationColor: "rgba(10,10,10,0.25)",
            textUnderlineOffset: 4,
          }}
        >
          {label}
        </Link>
      </div>
    </div>
  );
}

/** Compact mockup based on /adaptar/resultado — a critical-score example, two-column detail. */
export function AnaliseMock() {
  return (
    <div style={{ background: "#fff", fontFamily: GEIST, textAlign: "left" }}>
      <FadeCta
        maxHeight={620}
        className="am-fade"
        href="/adaptar"
        label="Clique aqui e veja uma análise completa real →"
      >
        <div className="am-wrap" style={{ padding: "32px 34px 0" }}>
          <div
            className="am-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
              marginBottom: 26,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: RED,
                  }}
                />
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: GRAY,
                  }}
                >
                  Relatório · Analista de Dados Sênior · iFood
                </span>
              </div>
              <h3
                style={{
                  fontSize: 29,
                  fontWeight: 500,
                  letterSpacing: -0.6,
                  margin: "0 0 10px",
                  color: "#0a0a0a",
                  lineHeight: 1.15,
                }}
              >
                Análise completa{" "}
                <em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic" }}>
                  do seu CV.
                </em>
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "#5a5a56",
                  margin: "0 0 16px",
                  maxWidth: 440,
                  lineHeight: 1.5,
                }}
              >
                Seu CV cobre parte dos requisitos técnicos, mas faltam
                evidências centrais pra essa vaga.
              </p>
              <div style={{ display: "flex", gap: 26 }}>
                {[
                  { n: "52", l: "SCORE ATUAL" },
                  { n: "+33", l: "PTS DISPONÍVEIS" },
                  { n: "9", l: "AJUSTES IDENTIFICADOS" },
                ].map((s) => (
                  <div key={s.l}>
                    <div
                      style={{
                        fontSize: 21,
                        fontWeight: 600,
                        color: "#0a0a0a",
                        lineHeight: 1,
                      }}
                    >
                      {s.n}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 8.5,
                        letterSpacing: 0.6,
                        color: GRAY,
                        marginTop: 4,
                      }}
                    >
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="am-score-panel"
              style={{
                background: "#0a0a0a",
                borderRadius: 14,
                padding: "18px 30px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: 0.6,
                }}
              >
                ATS SCORE · ATUAL
              </div>
              <ScoreRing value={52} color={RED} size={104} />
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  color: RED,
                  letterSpacing: 0.4,
                }}
              >
                +33 pts possíveis
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              borderRadius: 999,
              overflow: "hidden",
              height: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ flex: 22, background: ORANGE }} />
            <div style={{ width: 3, background: "#fff" }} />
            <div style={{ flex: 15, background: LIME }} />
            <div style={{ width: 3, background: "#fff" }} />
            <div style={{ flex: 8, background: BLUE }} />
            <div style={{ flex: 55, background: "rgba(10,10,10,0.06)" }} />
          </div>
          <div
            className="am-legend"
            style={{
              display: "flex",
              gap: 18,
              fontSize: 11.5,
              color: GRAY,
              marginBottom: 24,
            }}
          >
            <span>
              <span style={{ color: ORANGE }}>●</span> S1 Experiência 22/50
            </span>
            <span>
              <span style={{ color: LIME_DEEP }}>●</span> S2 Keywords 15/40
            </span>
            <span>
              <span style={{ color: BLUE }}>●</span> S3 Formatação 8/10
            </span>
          </div>

          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: "18px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  background: ORANGE,
                  borderRadius: 5,
                  padding: "2px 6px",
                }}
              >
                S1
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: "#0a0a0a" }}>
                Experiência Profissional
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: GRAY }}>
                22 / 50 pts
              </span>
            </div>
            <div className="am-cols" style={{ display: "flex", gap: 26 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: 0.5,
                    color: GRAY,
                    marginBottom: 10,
                  }}
                >
                  PONTOS FORTES
                </div>
                {[
                  "Experiência sólida com SQL e Python",
                  "Boa comunicação escrita nas descrições",
                ].map((t) => (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderTop: `1px solid ${BORDER}`,
                      fontSize: 12.5,
                      color: "#3a3a36",
                    }}
                  >
                    {t}
                    <span
                      style={{
                        color: LIME_DEEP,
                        background: "rgba(198,255,58,0.25)",
                        borderRadius: 5,
                        padding: "2px 6px",
                        fontSize: 10.5,
                        fontWeight: 600,
                        flexShrink: 0,
                        marginLeft: 10,
                      }}
                    >
                      +6 pts
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: 0.5,
                    color: GRAY,
                    marginBottom: 10,
                  }}
                >
                  O QUE O EARLYCV PODE MELHORAR AO LIBERAR CV
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: `1px solid ${BORDER}`,
                    fontSize: 12,
                    color: "#3a3a36",
                    lineHeight: 1.4,
                  }}
                >
                  <div>
                    <strong>Liderança técnica</strong> — não menciona times
                    liderados ou mentoria.
                  </div>
                  <span
                    style={{
                      color: LIME_DEEP,
                      background: "rgba(198,255,58,0.25)",
                      borderRadius: 5,
                      padding: "2px 6px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +5 pts
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: `1px solid ${BORDER}`,
                    fontSize: 12,
                    color: RED,
                    lineHeight: 1.4,
                  }}
                >
                  <div>
                    <strong style={{ color: "#3a3a36" }}>
                      Machine learning
                    </strong>{" "}
                    <span style={{ color: "#3a3a36" }}>
                      — sem evidência no CV, pedido na vaga.
                    </span>
                  </div>
                  <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                    -6 pts
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FadeCta>
    </div>
  );
}

/** Compact mockup based on the CV editor / adapted-resume view — antes/depois + document preview. */
export function OtimizacaoMock() {
  return (
    <div style={{ fontFamily: GEIST, textAlign: "left", background: "#fff" }}>
      <div
        className="om-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 22px",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <LogoMark />
        <div
          className="om-actions"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ fontSize: 11, color: GRAY, marginRight: 6 }}>
            Ver candidatura ↗
          </span>
          {["Editar CV", "Carta de apresentação", "DOCX"].map((b) => (
            <span
              key={b}
              style={{
                fontSize: 10.5,
                color: "#3a3a36",
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                padding: "5px 9px",
              }}
            >
              {b}
            </span>
          ))}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "#0a0a0a",
              background: LIME,
              borderRadius: 6,
              padding: "5px 9px",
            }}
          >
            PDF
          </span>
        </div>
      </div>

      <FadeCta
        maxHeight={520}
        className="om-fade"
        href="/adaptar"
        label="Clique aqui e veja a otimização completa real →"
      >
        <div className="om-body" style={{ display: "flex" }}>
          <div
            className="om-sidebar"
            style={{
              width: 260,
              flexShrink: 0,
              background: "#0a0a0a",
              padding: "24px 20px",
              color: "#fff",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: "rgba(255,255,255,0.4)",
                marginBottom: 16,
              }}
            >
              ← análise completa
            </div>
            <div style={{ display: "flex", gap: 22, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: RED }}>
                  52
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 8.5,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  CRÍTICO
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.35)",
                  alignSelf: "center",
                }}
              >
                +33
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>
                  85
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 8.5,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  BOM
                </div>
              </div>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                marginBottom: 20,
                overflow: "hidden",
              }}
            >
              <div style={{ width: "85%", height: "100%", background: LIME }} />
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: 0.6,
                color: "rgba(255,255,255,0.45)",
                marginBottom: 12,
              }}
            >
              12 AJUSTES APLICADOS
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 8.5,
                letterSpacing: 0.5,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 6,
              }}
            >
              TEXTO REESCRITO
            </div>
            {[
              {
                l: "Reescrita do Perfil Profissional",
                d: "Destaca aderência à vaga",
                pts: null,
              },
              {
                l: "Conhecimento em gestão de portfólio incluído",
                d: 'Keyword "Gestão de Portfólio"',
                pts: "+3",
              },
              {
                l: "Business Case incluído",
                d: 'Keyword "Business Case"',
                pts: "+3",
              },
              {
                l: "Conhecimento sobre LGPD aplicado",
                d: "Reforça compliance na experiência",
                pts: "+2",
              },
            ].map((it) => (
              <div
                key={it.l}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 9,
                  padding: "9px 10px",
                  marginBottom: 7,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: "#e4e4e0",
                    fontWeight: 500,
                  }}
                >
                  {it.l}
                  {it.pts && (
                    <span style={{ color: LIME, fontWeight: 600 }}>
                      {" "}
                      {it.pts}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.4)",
                    marginTop: 2,
                  }}
                >
                  {it.d}
                </div>
              </div>
            ))}
          </div>

          <div
            className="om-cv"
            style={{ flex: 1, padding: "30px 36px", minWidth: 0 }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0a0a0a" }}>
              PAULO CESAR ALOZEN
            </div>
            <div style={{ fontSize: 11, color: GRAY, marginBottom: 18 }}>
              Curitiba, PR · pc_alozen@yahoo.com · linkedin.com/in/pauloalozen
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 0.8,
                color: "#0a0a0a",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              EXPERIÊNCIA
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0a0a0a" }}>
              Gerente — Dados, Analytics e Plataformas Digitais
            </div>
            <div style={{ fontSize: 11, color: GRAY, marginBottom: 10 }}>
              Suzano SA · Jun 2023 – Mar 2026
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: "#3a3a36",
                background: "rgba(198,255,58,0.14)",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 10,
              }}
            >
              Conduzi o portfólio corporativo de inovação e transformação
              digital, priorizando iniciativas de maior impacto por meio de{" "}
              <span
                style={{ background: "rgba(198,255,58,0.55)", fontWeight: 600 }}
              >
                business cases estruturados e acompanhamento de value
                realization
              </span>{" "}
              validado com a Controladoria.
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "#3a3a36" }}>
              Estruturei programa de automação com metodologia Lean e gestão da
              mudança ativa, gerando ganho superior a 6.500 horas/ano.
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: "#3a3a36",
                marginTop: 6,
              }}
            >
              Defini e implementei arquitetura de dados corporativa com{" "}
              <span
                style={{ background: "rgba(198,255,58,0.55)", fontWeight: 600 }}
              >
                Data Lake e plataformas analíticas
              </span>
              , viabilizando ambientes escaláveis para analytics e IA.
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#0a0a0a",
                marginTop: 20,
              }}
            >
              Founder &amp; AI Engineer
            </div>
            <div style={{ fontSize: 11, color: GRAY, marginBottom: 8 }}>
              EarlyCV · Mar 2026 – Atual
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "#3a3a36" }}>
              Idealizei e liderei todo o ciclo de vida do produto, desde a
              concepção até o lançamento, utilizando IA como acelerador de
              engenharia e produtividade.
            </div>
          </div>
        </div>
      </FadeCta>
    </div>
  );
}

/** Compact mockup based on /radar — job matches with real aderência scoring. */
export function RadarMock() {
  const jobs = [
    {
      company: "ACME S/A",
      title: "Analista Desenvolvedor SR – Full Stack",
      location: "Belo Horizonte, MG",
      tags: ["typescript", "nodejs", "nestjs"],
    },
    {
      company: "NORTHWIND LTDA",
      title: "Analista de Processos | Serviços de IA",
      location: "Francisco Beltrão, PR",
      tags: ["machine learning", "deep learning", "automação"],
    },
    {
      company: "VÉRTICE SISTEMAS",
      title: "Engenheiro de Dados (Tech Lead)",
      location: "São Paulo, SP",
      tags: ["engenharia de dados", "databricks", "aws"],
    },
    {
      company: "ORION TECH",
      title: "Fullstack Engineer",
      location: "Remoto, Brasil",
      tags: ["react", "typescript", "next.js"],
    },
  ];
  return (
    <div
      className="rm-wrap"
      style={{
        background: "#fff",
        padding: "32px 34px 30px",
        fontFamily: GEIST,
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: LIME,
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: GRAY,
          }}
        >
          Radar de Oportunidades
        </span>
      </div>
      <h3
        style={{
          fontSize: 27,
          fontWeight: 500,
          letterSpacing: -0.6,
          margin: "0 0 16px",
          color: "#0a0a0a",
          lineHeight: 1.15,
        }}
      >
        Calibrado para{" "}
        <em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic" }}>
          Dados &amp; IA &amp; Engenharia de Software
        </em>{" "}
        · lead
      </h3>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 22,
        }}
      >
        <span style={{ fontSize: 14, color: "#0a0a0a" }}>
          <strong>5019</strong>{" "}
          <span style={{ color: GRAY }}>vagas analisadas</span>
        </span>
        <span style={{ fontSize: 14, color: LIME_DEEP }}>
          <strong>32</strong>{" "}
          <span style={{ color: GRAY }}>altamente compatíveis</span>
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: MONO,
            fontSize: 10,
            color: LIME_DEEP,
            background: "rgba(198,255,58,0.25)",
            borderRadius: 999,
            padding: "5px 11px",
          }}
        >
          ✓ CV calibrado
        </span>
      </div>

      <div className="rm-jobs" style={{ display: "flex", gap: 14 }}>
        {jobs.map((j) => (
          <div
            key={j.title}
            className="rm-job-card"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "14px 15px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 8.5, color: GRAY }}>
                {j.company}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 8,
                  color: LIME_DEEP,
                  background: "rgba(198,255,58,0.25)",
                  borderRadius: 999,
                  padding: "2px 6px",
                  whiteSpace: "nowrap",
                }}
              >
                muito aderente
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: "#0a0a0a",
                lineHeight: 1.35,
                marginBottom: 4,
                minHeight: 34,
              }}
            >
              {j.title}
            </div>
            <div style={{ fontSize: 10, color: GRAY, marginBottom: 10 }}>
              {j.location}
            </div>
            <div
              style={{
                display: "flex",
                gap: 5,
                flexWrap: "wrap",
                marginBottom: 14,
                minHeight: 42,
                alignContent: "flex-start",
              }}
            >
              {j.tags.map((t) => (
                <Tag key={t}>✓ {t}</Tag>
              ))}
            </div>
            <div
              style={{
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 7,
                padding: "7px 0",
                textAlign: "center",
                fontSize: 10.5,
                fontWeight: 500,
                marginTop: "auto",
              }}
            >
              ⚡ Analisar meu CV
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: "16px 18px",
          marginTop: 14,
        }}
      >
        <div
          className="rm-full-row"
          style={{ display: "flex", alignItems: "center", gap: 14 }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: "#0a0a0a",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
            >
              <rect x="0" y="0" width="12" height="6.5" rx="2" fill="#fafaf6" />
              <rect
                x="16"
                y="0"
                width="12"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
              <rect
                x="0"
                y="11.2"
                width="16"
                height="6.5"
                rx="2"
                fill="#c6ff3a"
              />
              <rect
                x="20"
                y="11.2"
                width="18"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="0"
                y="22.4"
                width="7"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="11"
                y="22.4"
                width="16"
                height="6.5"
                rx="2"
                fill="#c6ff3a"
              />
              <rect
                x="30"
                y="22.4"
                width="8"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="0"
                y="33.5"
                width="22"
                height="6.5"
                rx="2"
                fill="#fafaf6"
              />
              <rect
                x="26"
                y="33.5"
                width="9"
                height="6.5"
                rx="2"
                fill="rgba(250,250,246,0.14)"
              />
            </svg>
          </div>
          <div className="rm-full-text" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0a0a0a" }}>
              Analista Desenvolvedor SR – Full Stack
            </div>
            <div style={{ fontSize: 10.5, color: GRAY, marginTop: 2 }}>
              earlyCV · Belo Horizonte, MG · há 19 semanas
            </div>
          </div>
          <div
            className="rm-full-ring"
            style={{ textAlign: "center", flexShrink: 0 }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: `conic-gradient(${LIME} 288deg, rgba(10,10,10,0.08) 0deg)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#0a0a0a",
                    lineHeight: 1,
                  }}
                >
                  4
                </span>
                <span style={{ fontSize: 7, color: GRAY, lineHeight: 1 }}>
                  de 5
                </span>
              </div>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 7.5,
                color: LIME_DEEP,
                marginTop: 4,
                whiteSpace: "nowrap",
              }}
            >
              MUITO ADERENTE
            </div>
          </div>
          <span
            className="rm-full-cta"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 7,
              padding: "9px 14px",
              fontSize: 10.5,
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            ⚡ Analisar meu CV
          </span>
        </div>

        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            marginTop: 14,
            paddingTop: 12,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: 0.5,
              color: GRAY,
              marginBottom: 10,
            }}
          >
            COMPOSIÇÃO DO SCORE
          </div>
          <div className="rm-score-grid" style={{ display: "flex", gap: 22 }}>
            {[
              { k: "ÁREA", pct: 100, frac: "1 de 1" },
              { k: "SKILLS", pct: 80, frac: "4 de 5" },
              { k: "SENIORIDADE", pct: 0, frac: "0 de 1" },
              { k: "TECNOLOGIAS", pct: 80, frac: "7 de 9" },
            ].map((d) => (
              <div
                key={d.k}
                className="rm-score-item"
                style={{ flex: 1, minWidth: 0 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontFamily: MONO, color: GRAY }}>{d.k}</span>
                  <span style={{ color: "#0a0a0a", fontWeight: 600 }}>
                    {d.pct}%
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 999,
                    background: "rgba(10,10,10,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${d.pct}%`,
                      height: "100%",
                      background: LIME,
                    }}
                  />
                </div>
                <div style={{ fontSize: 9.5, color: GRAY, marginTop: 4 }}>
                  {d.frac}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "18px 0 4px" }}>
        <Link
          href="/radar"
          style={{
            fontFamily: GEIST,
            fontSize: 13,
            fontWeight: 500,
            color: "#0a0a0a",
            textDecoration: "underline",
            textDecorationColor: "rgba(10,10,10,0.25)",
            textUnderlineOffset: 4,
          }}
        >
          Ver minhas oportunidades no Radar →
        </Link>
      </div>
    </div>
  );
}

/** Compact mockup of Meu Monitor — destaca a configuração (área/senioridade + frequência) e simula o e-mail recebido com o digest. */
export function MonitorMock() {
  const skills = ["arquitetura", "cloud", "integração", "aws"];

  return (
    <div
      className="mm-wrap"
      style={{
        background: "#fff",
        padding: "32px 34px 30px",
        fontFamily: GEIST,
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#2fa84c",
            boxShadow: "0 0 0 3px rgba(47,168,76,0.18)",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: GRAY,
          }}
        >
          Seu Monitor está procurando
        </span>
      </div>
      <h3
        style={{
          fontSize: 27,
          fontWeight: 500,
          letterSpacing: -0.6,
          margin: "0 0 22px",
          color: "#0a0a0a",
          lineHeight: 1.15,
        }}
      >
        Vagas novas, todo dia, direto na{" "}
        <em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic" }}>
          sua caixa de entrada
        </em>
      </h3>

      {/* Configuração — o que dá pra ajustar em segundos */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: "18px 20px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: GRAY,
            marginBottom: 12,
          }}
        >
          Você configura em segundos
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#0a0a0a",
                marginBottom: 8,
              }}
            >
              Dados &amp; IA · Engenharia de Software · lead
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {skills.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </div>
          <div className="mm-config-freq" style={{ flexShrink: 0 }}>
            <div
              className="mm-freq-label"
              style={{
                fontFamily: MONO,
                fontSize: 8.5,
                color: GRAY,
                marginBottom: 6,
                textAlign: "right",
              }}
            >
              FREQUÊNCIA DO ALERTA
            </div>
            <div className="mm-freq-pills" style={{ display: "flex", gap: 6 }}>
              {["Diariamente", "Semanalmente", "Desativado"].map((freq, i) => (
                <span
                  key={freq}
                  style={{
                    fontFamily: GEIST,
                    fontSize: 10.5,
                    fontWeight: 500,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: i === 0 ? "#0a0a0a" : "#fff",
                    color: i === 0 ? "#fff" : "#3a3a38",
                    border: i === 0 ? "none" : `1px solid ${BORDER}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {freq}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Simulação do e-mail recebido — layout inspirado numa caixa de entrada (sem reproduzir marca/logo de terceiros), em modo claro. Título grande e explícito pra deixar claro que isso acontece fora do EarlyCV, no e-mail da pessoa. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>E-mail</title>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
          <path d="M3.5 6l8.5 7 8.5-7" />
        </svg>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: GRAY,
          }}
        >
          Fora do EarlyCV · direto no seu e-mail
        </span>
      </div>
      <h4
        style={{
          fontSize: 21,
          fontWeight: 600,
          letterSpacing: -0.4,
          margin: "0 0 14px",
          color: "#0a0a0a",
          lineHeight: 1.25,
        }}
      >
        As oportunidades chegam{" "}
        <em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic" }}>
          primeiro no seu e-mail
        </em>
        .
      </h4>
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        {/* Barra superior */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 16px",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <svg
            width="16"
            height="12"
            viewBox="0 0 24 18"
            fill="none"
            stroke="#5a5a56"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <title>Menu</title>
            <path d="M1 1h22M1 9h22M1 17h22" />
          </svg>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Correio</title>
              <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
              <path d="M3.5 6l8.5 7 8.5-7" />
            </svg>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0a0a0a" }}>
              Correio
            </span>
          </div>
          <div
            className="mm-inbox-search"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#f1f1ef",
              borderRadius: 20,
              padding: "7px 14px",
              maxWidth: 340,
              margin: "0 8px",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke={GRAY}
              strokeWidth="2"
              strokeLinecap="round"
            >
              <title>Pesquisar</title>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span style={{ fontSize: 12, color: GRAY }}>Pesquisar e-mail</span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 14,
              color: GRAY,
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>Ajuda</title>
              <circle cx="12" cy="12" r="9" />
              <path
                d="M9.5 9a2.5 2.5 0 114 2c-.7.6-1.5 1-1.5 2.2"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="17"
                r="0.6"
                fill="currentColor"
                stroke="none"
              />
            </svg>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Configurações</title>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.22.65.22 1H21a2 2 0 010 4h-.09c-.35 0-.69.08-1 .22z" />
            </svg>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Aplicativos</title>
              <circle cx="6" cy="6" r="1.4" />
              <circle cx="12" cy="6" r="1.4" />
              <circle cx="18" cy="6" r="1.4" />
              <circle cx="6" cy="12" r="1.4" />
              <circle cx="12" cy="12" r="1.4" />
              <circle cx="18" cy="12" r="1.4" />
              <circle cx="6" cy="18" r="1.4" />
              <circle cx="12" cy="18" r="1.4" />
              <circle cx="18" cy="18" r="1.4" />
            </svg>
          </div>
        </div>

        <div style={{ display: "flex" }}>
          {/* Barra lateral */}
          <div
            className="mm-inbox-sidebar"
            style={{
              width: 148,
              flexShrink: 0,
              borderRight: `1px solid ${BORDER}`,
              padding: "14px 10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${BORDER}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                borderRadius: 20,
                padding: "9px 14px",
                marginBottom: 16,
                fontSize: 12,
                fontWeight: 500,
                color: "#3a3a38",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Escrever</title>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              Escrever
            </div>
            {[
              { label: "Caixa de entrada", count: "1", active: true },
              { label: "Com estrela" },
              { label: "Enviados" },
              { label: "Importante" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 8px",
                  borderRadius: 0,
                  background: item.active
                    ? "rgba(198,255,58,0.28)"
                    : "transparent",
                  fontWeight: item.active ? 700 : 400,
                  fontSize: 12.5,
                  color: "#0a0a0a",
                  marginBottom: 2,
                }}
              >
                <span>{item.label}</span>
                {item.count ? (
                  <span style={{ fontWeight: 700, fontSize: 11.5 }}>
                    {item.count}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Lista de e-mails */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mm-inbox-tabs"
              style={{
                display: "flex",
                borderBottom: `1px solid ${BORDER}`,
                padding: "0 16px",
              }}
            >
              {[
                { label: "Principal", active: true },
                { label: "Social" },
                { label: "Atualizações", badge: "1 novo" },
              ].map((tab) => (
                <div
                  key={tab.label}
                  style={{
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: tab.active ? 600 : 500,
                    color: tab.active ? "#0a0a0a" : GRAY,
                    borderBottom: tab.active
                      ? "2px solid #0a0a0a"
                      : "2px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {tab.label}
                  {tab.badge ? (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#3a5008",
                        background: "rgba(198,255,58,0.4)",
                        borderRadius: 999,
                        padding: "1px 6px",
                      }}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {[
              {
                sender: "Meu Monitor",
                subject: "3 vagas novas com alta aderência ao seu perfil",
                snippet:
                  "Cresol, Nubank e CI&T têm vagas que batem muito com você — dá uma olhada antes que...",
                time: "09:02",
                unread: true,
              },
              {
                sender: "LinkedIn",
                subject: "Vagas recomendadas para você esta semana",
                snippet: "Confira as 12 novas oportunidades na sua área...",
                time: "ontem",
                unread: false,
              },
              {
                sender: "GitHub",
                subject: "Weekly digest",
                snippet: "Atividade dos repositórios que você segue...",
                time: "ontem",
                unread: false,
              },
            ].map((mail) => (
              <div
                key={mail.sender + mail.subject}
                className="mm-mail-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 16px",
                  borderBottom: `1px solid ${BORDER}`,
                  background: mail.unread ? "rgba(198,255,58,0.06)" : "#fff",
                }}
              >
                <span
                  aria-hidden
                  className="mm-mail-check"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: `1.5px solid ${mail.unread ? "#0a0a0a" : "#c8c6bf"}`,
                    flexShrink: 0,
                  }}
                />
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={mail.unread ? "#f5c518" : "#d8d6ce"}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  className="mm-mail-star"
                  style={{ flexShrink: 0 }}
                >
                  <title>Com estrela</title>
                  <path d="M12 2.5l2.9 6 6.6.7-4.9 4.6 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.6 6.6-.7z" />
                </svg>
                <span
                  className="mm-mail-sender"
                  style={{
                    width: 110,
                    flexShrink: 0,
                    fontSize: 12.5,
                    fontWeight: mail.unread ? 700 : 400,
                    color: "#0a0a0a",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {mail.sender}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: mail.unread ? 700 : 400,
                      color: "#0a0a0a",
                    }}
                  >
                    {mail.subject}
                  </span>
                  <span style={{ color: GRAY }}> — {mail.snippet}</span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: mail.unread ? "#0a0a0a" : GRAY,
                    fontWeight: mail.unread ? 600 : 400,
                    flexShrink: 0,
                  }}
                >
                  {mail.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/monitor"
        style={{
          display: "inline-block",
          marginTop: 18,
          fontSize: 13,
          fontWeight: 500,
          color: "#0a0a0a",
          textDecoration: "underline",
          textDecorationColor: "rgba(10,10,10,0.25)",
          textUnderlineOffset: 4,
        }}
      >
        Ativar meu Monitor de vagas →
      </Link>
    </div>
  );
}

/** Compact mockup based on a candidatura detail page — status journey + interview + side panel. */
export function GestaoMock() {
  const steps = [
    { l: "Analisada", state: "done" },
    { l: "CV liberado", state: "done" },
    { l: "Candidatado", state: "done" },
    { l: "Em entrevista", state: "active" },
    { l: "Resultado", state: "pending" },
  ] as const;
  const events = [
    { d: "26 de ago.", l: "Status atualizado para Em entrevista", done: false },
    { d: "21 de ago.", l: "Candidatura criada automaticamente", done: false },
    { d: "21 de ago.", l: "Análise concluída. Score inicial 54%", done: true },
  ];
  return (
    <div
      className="gm-wrap"
      style={{
        background: "#fff",
        padding: "30px 34px 28px",
        fontFamily: GEIST,
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 11, color: GRAY, marginBottom: 4 }}>
        Minhas candidaturas / COORDENADOR DATA ANALYTICS
      </div>
      <div style={{ fontSize: 10.5, color: GRAY, marginBottom: 6 }}>ASSAÍ</div>
      <h3
        style={{
          fontSize: 22,
          fontWeight: 700,
          margin: "0 0 10px",
          color: "#0a0a0a",
        }}
      >
        COORDENADOR DATA ANALYTICS
      </h3>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          rowGap: 10,
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: GRAY,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: AMBER,
              background: "rgba(245,158,11,0.14)",
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            ● EM ENTREVISTA
          </span>
          <span>
            1 análise · melhor score{" "}
            <strong style={{ color: LIME_DEEP }}>71%</strong>
          </span>
        </div>
        <div
          className="gm-actions"
          style={{ display: "flex", gap: 8, flexShrink: 0 }}
        >
          {["Status ▾", "+ Link da vaga"].map((b) => (
            <span
              key={b}
              style={{
                border: `1px solid ${BORDER}`,
                color: "#3a3a36",
                borderRadius: 8,
                padding: "9px 13px",
                fontSize: 11.5,
                whiteSpace: "nowrap",
              }}
            >
              {b}
            </span>
          ))}
          <span
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 11.5,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Liberar CV para entrevista
          </span>
        </div>
      </div>

      <div className="gm-body" style={{ display: "flex", gap: 22 }}>
        <div className="gm-main-col" style={{ flex: "0 0 66%", minWidth: 0 }}>
          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "18px 20px 14px",
              marginBottom: 16,
            }}
          >
            <div
              className="gm-steps"
              style={{ display: "flex", alignItems: "center" }}
            >
              {steps.map((s, i) => (
                <div
                  key={s.l}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flex: i < steps.length - 1 ? 1 : "none",
                  }}
                >
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          s.state === "done"
                            ? LIME
                            : s.state === "active"
                              ? "#fff"
                              : "rgba(10,10,10,0.06)",
                        border:
                          s.state === "active" ? `2px solid ${AMBER}` : "none",
                      }}
                    >
                      {s.state === "done" && (
                        <span style={{ fontSize: 12, color: "#0a0a0a" }}>
                          ✓
                        </span>
                      )}
                      {s.state === "active" && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: AMBER,
                          }}
                        />
                      )}
                    </div>
                    <div
                      className="gm-step-name"
                      style={{
                        fontSize: 10,
                        color: s.state === "pending" ? "#c4c3bd" : "#3a3a36",
                        marginTop: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.l}
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      style={{
                        height: 2,
                        flex: 1,
                        background:
                          s.state === "done"
                            ? LIME
                            : "repeating-linear-gradient(90deg, rgba(10,10,10,0.15) 0 4px, transparent 4px 8px)",
                        marginBottom: 18,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              fontSize: 12,
              color: "#3a3a36",
            }}
          >
            <span>📅</span>
            <span>
              <strong>Entrevista agendada</strong> — 27 de ago. · 17:20 — RH com
              Assaí
            </span>
          </div>

          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "14px 18px",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: 0.5,
                color: GRAY,
                marginBottom: 10,
              }}
            >
              ANÁLISES DESTA CANDIDATURA
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{ fontSize: 13, fontWeight: 500, color: "#0a0a0a" }}
                  >
                    COORDENADOR DATA ANALYTICS · Assaí
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 8.5,
                      color: LIME_DEEP,
                      background: "rgba(198,255,58,0.25)",
                      borderRadius: 999,
                      padding: "2px 7px",
                    }}
                  >
                    MELHOR SCORE
                  </span>
                </div>
                <div style={{ fontSize: 11, color: GRAY, marginTop: 3 }}>
                  +17% após ajustes
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: LIME_DEEP }}>
                71<span style={{ fontSize: 14 }}>%</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <span
                style={{
                  border: `1px solid ${BORDER}`,
                  color: "#3a3a36",
                  borderRadius: 7,
                  padding: "7px 11px",
                  fontSize: 11,
                }}
              >
                Rever análise
              </span>
              <span
                style={{
                  border: `1px solid ${BORDER}`,
                  color: "#3a3a36",
                  borderRadius: 7,
                  padding: "7px 11px",
                  fontSize: 11,
                }}
              >
                Liberar CV · 1 crédito
              </span>
              <span
                style={{
                  color: "#8a8a85",
                  borderRadius: 7,
                  padding: "7px 4px",
                  fontSize: 11,
                }}
              >
                + Fazer nova análise desta vaga
              </span>
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "14px 18px",
              marginTop: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: 0.5,
                  color: GRAY,
                }}
              >
                NOTAS
              </span>
              <span style={{ fontSize: 11, color: "#3a3a36" }}>
                + Adicionar
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#8a8a85" }}>
              Nenhuma nota adicionada ainda.
            </div>
          </div>
        </div>

        <div className="gm-side-col" style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "16px 18px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: 0.5,
                color: GRAY,
                marginBottom: 12,
              }}
            >
              DETALHES
            </div>
            {[
              ["Empresa", "Assaí"],
              ["Origem", "analysis.auto"],
              ["Criada", "21 de ago. de 2026"],
              ["Entrevista", "27 de ago. · 17:20"],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "7px 0",
                  borderTop: `1px solid ${BORDER}`,
                  fontSize: 11.5,
                }}
              >
                <span style={{ color: GRAY }}>{k}</span>
                <span style={{ color: "#0a0a0a", fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: 0.5,
                color: GRAY,
                marginBottom: 12,
              }}
            >
              REGISTRO DE EVENTOS
            </div>
            {events.map((e) => (
              <div
                key={e.l}
                style={{
                  display: "flex",
                  gap: 10,
                  paddingBottom: 12,
                  marginBottom: 12,
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: e.done ? LIME : "rgba(10,10,10,0.15)",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div>
                  <div style={{ fontSize: 9.5, color: GRAY }}>{e.d}</div>
                  <div style={{ fontSize: 11.5, color: "#3a3a36" }}>{e.l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact mockup based on the interview-prep drawer — estratégia + pontos de atenção/fortes. */
export function PreparacaoMock() {
  return (
    <div
      className="pm-wrap"
      style={{
        background: "#fff",
        padding: "30px 34px 28px",
        fontFamily: GEIST,
        textAlign: "left",
      }}
    >
      <div
        className="pm-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: LIME,
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: GRAY,
            }}
          >
            Preparação com IA · baseada no seu CV
          </span>
        </div>
        <span
          style={{
            border: `1px solid ${BORDER}`,
            color: "#3a3a36",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 11,
          }}
        >
          Exportar PDF
        </span>
      </div>
      <h3
        style={{
          fontSize: 27,
          fontWeight: 500,
          letterSpacing: -0.6,
          margin: "0 0 6px",
          color: "#0a0a0a",
        }}
      >
        Preparar{" "}
        <em style={{ fontFamily: SERIF_ITALIC, fontStyle: "italic" }}>
          entrevista.
        </em>
      </h3>
      <div style={{ fontSize: 12.5, color: GRAY, marginBottom: 14 }}>
        Cientista de Dados Pleno · iFood
      </div>
      <div
        className="pm-tags"
        style={{ display: "flex", gap: 8, marginBottom: 22 }}
      >
        {["Vaga + JD", "Análise", "CV adaptado (score 64%)", "Gaps (4)"].map(
          (t) => (
            <Tag key={t}>{t}</Tag>
          ),
        )}
      </div>

      <div className="pm-cols" style={{ display: "flex", gap: 22 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                background: "#0a0a0a",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              01
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#0a0a0a" }}>
              Estratégia
            </span>
          </div>
          <p
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "#3a3a36",
              margin: "0 0 20px",
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            Esta entrevista será um teste de alinhamento entre o que você
            declarou no CV e as exigências práticas da vaga, especialmente em ML
            e cloud. Mostre evolução: reconheça as lacunas e demonstre
            disposição para aprender e aplicar em cenários reais.
          </p>

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
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                background: "#0a0a0a",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              02
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#0a0a0a" }}>
              Pontos de atenção
            </span>
          </div>
          {[
            "Não minimize a importância dos requisitos de ML; reconheça e mostre plano de desenvolvimento",
            "Evite respostas genéricas sobre cloud; detalhe o que conhece e como aprende novos serviços",
          ].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "#3a3a36",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 9,
                padding: "9px 12px",
                marginBottom: 8,
              }}
            >
              <span style={{ color: AMBER, fontWeight: 600 }}>Atenção — </span>
              {t}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
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
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                background: "#0a0a0a",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              03
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#0a0a0a" }}>
              Pontos fortes para destacar
            </span>
          </div>
          {[
            "Experiência sólida com Python e SQL, com exemplos práticos de consultas complexas",
            "Uso de BigQuery e dbt, demonstrando familiaridade com ferramentas de dados modernas",
            "Construção de pipelines com Airflow, mostrando entendimento de orquestração",
          ].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "#3a3a36",
                background: "rgba(198,255,58,0.1)",
                border: "1px solid rgba(198,255,58,0.3)",
                borderRadius: 9,
                padding: "9px 12px",
                marginBottom: 8,
              }}
            >
              <span style={{ color: LIME_DEEP, fontWeight: 600 }}>
                Ponto —{" "}
              </span>
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Compact mockup for the carta de apresentação output — a finished, personalized letter. */
export function CartaMock() {
  return (
    <div
      className="cm-wrap"
      style={{
        display: "flex",
        fontFamily: GEIST,
        textAlign: "left",
        background: "#fff",
      }}
    >
      <div
        className="cm-sidebar"
        style={{
          width: 240,
          flexShrink: 0,
          background: "#0a0a0a",
          padding: "24px 20px",
          color: "#fff",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 0.6,
            color: "rgba(255,255,255,0.45)",
            marginBottom: 16,
          }}
        >
          CARTA DE APRESENTAÇÃO
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Engenheira de Dados Sênior
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 20,
          }}
        >
          Baseada no seu CV real + a vaga
        </div>
        {[
          "Puxa experiências reais do seu CV",
          "Conecta com o que a vaga pede",
          "Nunca inventa cargo ou resultado",
        ].map((t) => (
          <div
            key={t}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 11.5,
              color: "#e4e4e0",
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          >
            <span style={{ color: LIME, flexShrink: 0 }}>✓</span>
            {t}
          </div>
        ))}
      </div>

      <div
        className="cm-content"
        style={{ flex: 1, padding: "30px 36px", minWidth: 0 }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: GRAY,
            marginBottom: 14,
          }}
        >
          Prévia da carta
        </div>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.75,
            color: "#3a3a36",
            margin: 0,
          }}
        >
          Prezado(a) recrutador(a),
          <br />
          <br />
          Nos últimos três anos, liderei a migração de pipelines de dados que{" "}
          <span
            style={{ background: "rgba(198,255,58,0.55)", fontWeight: 600 }}
          >
            reduziu o tempo de processamento em 30%
          </span>{" "}
          — exatamente o tipo de ganho de eficiência que vejo destacado na vaga
          de Engenheira de Dados Sênior na [Empresa]. Tenho experiência prática
          com{" "}
          <span
            style={{ background: "rgba(198,255,58,0.55)", fontWeight: 600 }}
          >
            Python, Airflow e AWS
          </span>
          , as mesmas tecnologias citadas na descrição, e gostaria de conversar
          sobre como posso contribuir com o time...
        </p>
      </div>
    </div>
  );
}

type FeatureKey =
  | "analise"
  | "otimizacao"
  | "radar"
  | "monitor"
  | "gestao"
  | "preparacao";

const FEATURES: {
  key: FeatureKey;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "analise",
    label: "Análise de CV",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M20 20l-4.35-4.35" />
      </>
    ),
  },
  {
    key: "otimizacao",
    label: "Otimização de CV",
    icon: (
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    ),
  },
  {
    key: "radar",
    label: "Radar de Oportunidades",
    icon: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M12 12L19 8" />
        <path d="M5 12a7 7 0 0114 0M2.5 12a9.5 9.5 0 0119 0" />
      </>
    ),
  },
  {
    key: "monitor",
    label: "Alerta de Vagas",
    icon: (
      <>
        <path d="M10 21a2 2 0 003.46 0" />
        <path d="M4 17h16l-1.6-2.4A6 6 0 0117 11V9a5 5 0 00-10 0v2a6 6 0 01-1.4 3.6L4 17z" />
      </>
    ),
  },
  {
    key: "gestao",
    label: "Gestão de Candidaturas",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 14h3" />
      </>
    ),
  },
  {
    key: "preparacao",
    label: "Preparação para Entrevistas",
    icon: (
      <>
        <path d="M8 10h8M8 14h5" />
        <path d="M4 4h16v13H8l-4 3V4z" />
      </>
    ),
  },
];

/** Interactive pill row + matching visual — clicking a pill swaps the frame content. */
export function FeatureShowcase() {
  const [active, setActive] = useState<FeatureKey>("analise");

  // Clicar numa pill troca o mockup exibido — como o conteúdo muda de
  // altura, rolamos até o topo da seção (título "Tudo que você precisa" +
  // a fileira de pills) em vez de centralizar só o frame — assim as pills
  // continuam visíveis pro usuário poder trocar de novo sem procurar. O
  // offset compensa a nav fixa no topo (_nav-v2.tsx), que senão cobriria
  // o título logo depois do scroll.
  function handleSelect(key: FeatureKey) {
    setActive(key);
    const anchor = document.getElementById("tudo-que-voce-precisa");
    if (!anchor) return;
    const NAV_OFFSET = 88;
    const top =
      anchor.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <>
      <div
        className="lp-f-pill-row reveal-card"
        style={{ marginTop: 18, marginBottom: 36 }}
      >
        {FEATURES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => handleSelect(f.key)}
            className={`lp-f-pill${active === f.key ? " is-active" : ""}`}
            style={{ border: undefined, cursor: "pointer" }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={active === f.key ? "#fff" : "#6a6a66"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>{f.label}</title>
              {f.icon}
            </svg>
            {f.label}
          </button>
        ))}
      </div>

      <div
        className="reveal-card"
        style={{ ...browserFrame, maxWidth: 1080, width: "100%" }}
      >
        <BrowserChrome />
        {active === "analise" ? (
          <AnaliseMock />
        ) : active === "otimizacao" ? (
          <OtimizacaoMock />
        ) : active === "radar" ? (
          <RadarMock />
        ) : active === "monitor" ? (
          <MonitorMock />
        ) : active === "gestao" ? (
          <GestaoMock />
        ) : (
          <PreparacaoMock />
        )}
      </div>

      {/* Mobile-only overrides for the mockups above — desktop layout stays
       * untouched; these just stack the columns/rows that were designed for
       * a wide browserFrame so they fit a phone screen. */}
      <MockMobileStyles />
    </>
  );
}

/** Mobile-only CSS for every Mock component below (AnaliseMock, OtimizacaoMock,
 * RadarMock, MonitorMock, GestaoMock, PreparacaoMock, CartaMock) — desktop
 * layout is untouched. Render this once per page: FeatureShowcase already
 * does, but any page rendering a Mock component directly (the feature
 * marketing pages: analise-de-curriculo, radar-de-vagas, ...) needs it too,
 * since these classes have no effect unless this stylesheet is present. */
export function MockMobileStyles() {
  return (
    <style>{`
      @media (max-width: 640px) {
        /* AnaliseMock */
        .am-fade { max-height: 1400px !important; }
        .am-wrap { padding: 22px 18px 0 !important; }
        .am-header { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
        .am-score-panel { width: 100% !important; box-sizing: border-box !important; }
        .am-legend { flex-wrap: wrap !important; gap: 6px 14px !important; }
        .am-cols { flex-direction: column !important; gap: 20px !important; }

        /* OtimizacaoMock */
        .om-fade { max-height: 1500px !important; }
        .om-actions { flex-wrap: wrap !important; row-gap: 6px !important; justify-content: flex-end !important; }
        .om-body { flex-direction: column !important; }
        .om-sidebar { width: 100% !important; box-sizing: border-box !important; }
        .om-cv { padding: 22px 18px 26px !important; }

        /* RadarMock */
        .rm-wrap { padding: 22px 18px 24px !important; }
        .rm-jobs { overflow-x: auto !important; margin: 0 -18px !important; padding: 0 18px 6px !important; }
        .rm-job-card { flex: 0 0 220px !important; }
        .rm-full-row { flex-wrap: wrap !important; row-gap: 10px !important; }
        .rm-full-text { flex: 1 1 100% !important; order: 1 !important; }
        .rm-full-ring { order: 2 !important; display: flex !important; align-items: center !important; gap: 10px !important; text-align: left !important; }
        .rm-full-cta { order: 3 !important; display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
        .rm-score-grid { flex-wrap: wrap !important; gap: 14px 12px !important; }
        .rm-score-item { flex: 1 1 40% !important; min-width: 100px !important; }

        /* MonitorMock */
        .mm-wrap { padding: 22px 18px 24px !important; }
        .mm-inbox-search { display: none !important; }
        .mm-inbox-sidebar { display: none !important; }
        .mm-inbox-tabs { overflow-x: auto !important; }
        .mm-inbox-tabs > div { flex-shrink: 0 !important; white-space: nowrap !important; }
        .mm-config-freq { width: 100% !important; flex-shrink: 1 !important; }
        .mm-freq-label { text-align: left !important; }
        .mm-freq-pills { flex-wrap: wrap !important; }
        .mm-mail-check, .mm-mail-star { display: none !important; }
        .mm-mail-row { gap: 8px !important; padding: 11px 12px !important; }
        .mm-mail-sender { width: 68px !important; font-size: 11px !important; }

        /* GestaoMock */
        .gm-wrap { padding: 20px 18px 22px !important; }
        .gm-step-name { display: none !important; }
        .gm-actions { flex-wrap: wrap !important; flex-shrink: 1 !important; width: 100% !important; }
        .gm-body { flex-direction: column !important; gap: 16px !important; }
        .gm-main-col { flex: 1 1 auto !important; width: 100% !important; }
        .gm-side-col { width: 100% !important; }

        /* PreparacaoMock */
        .pm-wrap { padding: 20px 18px 22px !important; }
        .pm-header { flex-wrap: wrap !important; gap: 10px !important; }
        .pm-tags { flex-wrap: wrap !important; }
        .pm-cols { flex-direction: column !important; gap: 24px !important; }

        /* CartaMock */
        .cm-wrap { flex-direction: column !important; }
        .cm-sidebar { width: 100% !important; box-sizing: border-box !important; }
        .cm-content { padding: 22px 18px 26px !important; }
      }
    `}</style>
  );
}
