"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { Logo } from "@/components/logo";
import { PageShell } from "@/components/page-shell";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import {
  type CheckoutStatusResponse,
  getCheckoutStatusClient,
} from "@/lib/payments-browser-api";

type UIState = "polling" | "approved" | "pending-long" | "failed" | "error";

const MAX_POLLS = 15;
const POLL_INTERVAL_MS = 2000;

const MONO = "var(--font-geist-mono), monospace";
const SERIF = "var(--font-serif), Georgia, serif";

// ── Confetti ─────────────────────────────────────────────────────────────────

function Confetti({ active }: { active: boolean }) {
  const pieces = useMemo(() => {
    const arr = [];
    const rand = (seed: number) => {
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 32; i++) {
      const r1 = rand(i + 1);
      const r2 = rand(i + 31);
      const r3 = rand(i + 71);
      const r4 = rand(i + 113);
      arr.push({
        i,
        left: 8 + r1 * 84,
        dx: (r2 - 0.5) * 220,
        rot: 200 + r3 * 720,
        dur: 1.8 + r4 * 1.4,
        delay: r1 * 0.4,
        size: 6 + r2 * 8,
        color: (["#c6ff3a", "#0a0a0a", "#f5c518", "#fafaf6", "#c6ff3a"] as const)[
          Math.floor(r3 * 5)
        ],
        shape: r4 > 0.5 ? "rect" : "circle",
      });
    }
    return arr;
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      {pieces.map((p) => (
        <span
          key={p.i}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "12%",
            width: p.size,
            height: p.shape === "circle" ? p.size : p.size * 0.5,
            background: p.color,
            borderRadius: p.shape === "circle" ? "50%" : 2,
            opacity: 0,
            // @ts-expect-error CSS custom properties
            "--dx": `${p.dx}px`,
            "--rot": `${p.rot}deg`,
            animation: active
              ? `cv-fall ${p.dur}s cubic-bezier(0.22,0.61,0.36,1) ${p.delay}s forwards`
              : "none",
            boxShadow:
              p.color === "#c6ff3a" ? "0 0 8px rgba(198,255,58,0.4)" : "none",
          }}
        />
      ))}
    </div>
  );
}

// ── Receipt strip ─────────────────────────────────────────────────────────────

function ReceiptCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? 12 : 13.5,
          fontWeight: mono ? 400 : 500,
          letterSpacing: mono ? "0.01em" : "-0.01em",
          color: "#0a0a0a",
          fontFamily: mono ? MONO : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Stagger wrapper ───────────────────────────────────────────────────────────

function Stagger({
  mounted,
  delay,
  children,
}: {
  mounted: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        transform: mounted ? "translateY(0)" : "translateY(8px)",
        opacity: mounted ? 1 : 0,
        transition: `transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s, opacity 0.45s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ── Shared nav bar ────────────────────────────────────────────────────────────

function CheckoutNav({
  crumbActive,
  rightTag,
}: {
  crumbActive: string;
  rightTag?: React.ReactNode;
}) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 32px",
        borderBottom: "1px solid rgba(10,10,10,0.05)",
        position: "relative",
        zIndex: 3,
      }}
    >
      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
        }}
      >
        <Logo size="md" />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: "#8a8a85",
            border: "1px solid #d8d6ce",
            borderRadius: 3,
            padding: "1px 5px",
            fontWeight: 500,
          }}
        >
          v1.2
        </span>
      </a>

      <div
        className="hidden md:flex"
        style={{
          alignItems: "center",
          gap: 8,
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: "0.1em",
        }}
      >
        <span style={{ color: "#a0a098" }}>PLANOS</span>
        <span style={{ color: "#c8c6bf" }}>/</span>
        <span style={{ color: "#a0a098" }}>CHECKOUT</span>
        <span style={{ color: "#c8c6bf" }}>/</span>
        <span style={{ color: "#0a0a0a", fontWeight: 500 }}>{crumbActive}</span>
      </div>

      <div className="hidden md:block">{rightTag}</div>
    </nav>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function ConcluidoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkoutId");
  const mpPaymentId =
    searchParams.get("payment_id") ?? searchParams.get("collection_id");
  const mpCollectionStatus = searchParams.get("collection_status");
  const mpStatus = searchParams.get("status") ?? mpCollectionStatus;

  const [state, setState] = useState<UIState>("polling");
  const [result, setResult] = useState<CheckoutStatusResponse | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [approvedMounted, setApprovedMounted] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    if (state === "approved") {
      const id = requestAnimationFrame(() => setApprovedMounted(true));
      return () => cancelAnimationFrame(id);
    }
    setApprovedMounted(false);
  }, [state]);

  useEffect(() => {
    if (!checkoutId) return;

    void trackEvent({
      eventName: "payment_return_viewed",
      properties: {
        checkoutId,
        collection_status: mpCollectionStatus,
        paymentId: mpPaymentId,
        source_detail: "pagamento_concluido",
        status: mpStatus,
      },
    });
  }, [checkoutId, mpCollectionStatus, mpPaymentId, mpStatus]);

  useEffect(() => {
    if (!checkoutId) {
      setState("error");
      return;
    }

    const poll = async () => {
      try {
        const data = await getCheckoutStatusClient(checkoutId);
        setResult(data);

        if (data.nextAction === "show_success") {
          setState("approved");
          return;
        }

        if (
          data.nextAction === "show_failure" ||
          data.nextAction === "retry_payment"
        ) {
          setState("failed");
          return;
        }

        pollCount.current += 1;
        if (pollCount.current >= MAX_POLLS) {
          setState("pending-long");
          return;
        }

        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        setState("error");
      }
    };

    poll();
  }, [checkoutId]);

  const handleDownload = async (
    format: "pdf" | "docx",
    targetAdaptationId: string,
  ) => {
    if (downloading) return;
    setDownloading(format);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${targetAdaptationId}/download?format=${format}`,
        fallbackFilename: `cv-adaptado.${format}`,
        onStageChange: setDownloadStage,
      });
    } finally {
      setDownloading(null);
      setDownloadStage(null);
    }
  };

  const pageStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    minHeight: "100dvh",
    background:
      "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
    fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
    color: "#0a0a0a",
    display: "flex",
    flexDirection: "column",
  };

  // ── Polling ──
  if (state === "polling") {
    return (
      <div style={pageStyle}>
        <CheckoutNav crumbActive="CONFIRMADO" />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
          <p style={{ fontSize: 14, color: "#8a8a85" }}>Confirmando pagamento...</p>
        </div>
      </div>
    );
  }

  // ── Approved ──
  if (state === "approved") {
    const planName = result?.planName ?? result?.planPurchased;
    const credits = result?.creditsGranted;
    const paymentIdShort = result?.paymentId
      ? result.paymentId.slice(-8)
      : null;

    const showCvUnlock =
      result?.originAction === "unlock_cv" &&
      result.originAdaptationId &&
      result.autoUnlockProcessedAt &&
      !result.autoUnlockError &&
      result.adaptationUnlocked;

    const showAdaptation =
      result?.type === "adaptation" && result.adaptationId && !showCvUnlock;

    return (
      <div style={pageStyle}>
        <style>{`
          @keyframes cv-pulse {
            0%   { transform: scale(0.6); opacity: 0.55; }
            70%  { transform: scale(1.45); opacity: 0; }
            100% { transform: scale(1.45); opacity: 0; }
          }
          @keyframes cv-fall {
            0%   { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
            12%  { opacity: 1; }
            100% { transform: translate3d(var(--dx,0),540px,0) rotate(var(--rot,540deg)); opacity: 0; }
          }
          @keyframes cv-dotPulse {
            0%,100% { transform: scale(1); opacity: 1; }
            50%     { transform: scale(1.4); opacity: 0.6; }
          }
        `}</style>

        <Confetti active={approvedMounted} />

        <CheckoutNav
          crumbActive="CONFIRMADO"
          rightTag={
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: "0.04em",
                color: "#3a3a38",
                border: "1px solid rgba(64,84,16,0.25)",
                background: "rgba(198,255,58,0.18)",
                borderRadius: 6,
                padding: "6px 10px",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#6e9614",
                  boxShadow: "0 0 0 3px rgba(110,150,20,0.18)",
                  display: "inline-block",
                  animation: "cv-dotPulse 1.8s ease-in-out infinite",
                }}
              />
              <span>aprovado</span>
            </div>
          }
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px 20px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 20,
              padding: "48px 40px 40px",
              width: "100%",
              maxWidth: 560,
              textAlign: "center",
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.03), 0 24px 60px -22px rgba(10,10,10,0.18)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transform: approvedMounted
                ? "translateY(0) scale(1)"
                : "translateY(14px) scale(0.985)",
              opacity: approvedMounted ? 1 : 0,
              transition:
                "transform 0.6s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease-out",
            }}
          >
            {/* Check ring */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 22,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "rgba(198,255,58,0.55)",
                  zIndex: 1,
                  animation: approvedMounted
                    ? "cv-pulse 1.6s ease-out 0.15s 1 forwards"
                    : "none",
                }}
              />
              <div
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  border: "1px solid rgba(64,84,16,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 6px 20px -6px rgba(198,255,58,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                  position: "relative",
                  zIndex: 2,
                }}
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="#0a0a0a"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 30,
                      strokeDashoffset: approvedMounted ? 0 : 30,
                      transition:
                        "stroke-dashoffset 0.55s cubic-bezier(0.6,0,0.4,1) 0.25s",
                    }}
                  />
                </svg>
              </div>
            </div>

            <Stagger mounted={approvedMounted} delay={0.35}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "#8a8a85",
                  fontWeight: 500,
                  marginBottom: 14,
                }}
              >
                PAGAMENTO CONFIRMADO
              </div>
            </Stagger>

            <Stagger mounted={approvedMounted} delay={0.42}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 500,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.12,
                  color: "#0a0a0a",
                  marginBottom: 14,
                }}
              >
                {result?.originAction === "unlock_cv"
                  ? <>Seu CV já está <em style={{ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic" }}>liberado.</em></>
                  : result?.type === "plan"
                  ? <>Créditos <em style={{ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic" }}>ativados.</em></>
                  : <>Pagamento <em style={{ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic" }}>confirmado.</em></>}
              </div>
            </Stagger>

            <Stagger mounted={approvedMounted} delay={0.5}>
              <div
                style={{
                  fontSize: 14.5,
                  color: "#5a5a55",
                  lineHeight: 1.6,
                  marginBottom: 24,
                  maxWidth: 400,
                }}
              >
                {result?.message ??
                  (result?.type === "plan"
                    ? "Seus créditos estão disponíveis no painel."
                    : "Seu CV adaptado está pronto.")}
              </div>
            </Stagger>

            {result?.originAction === "unlock_cv" && result.autoUnlockError && (
              <Stagger mounted={approvedMounted} delay={0.5}>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "rgba(245,197,24,0.1)",
                    border: "1px solid rgba(245,197,24,0.25)",
                    marginBottom: 16,
                    fontSize: 13,
                    color: "#7a6b15",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  Seu pagamento foi aprovado e os créditos foram adicionados. Não
                  conseguimos liberar automaticamente este CV, mas você pode
                  liberá-lo manualmente.
                </div>
              </Stagger>
            )}

            {/* Receipt strip */}
            {(planName ?? credits ?? paymentIdShort) && (
              <Stagger mounted={approvedMounted} delay={0.58}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.07)",
                    borderRadius: 12,
                    padding: "14px 18px",
                    width: "100%",
                    marginBottom: 22,
                    textAlign: "left",
                  }}
                >
                  {planName && <ReceiptCell label="PACOTE" value={planName} />}
                  {credits && (
                    <ReceiptCell
                      label="CRÉDITOS"
                      value={String(credits)}
                    />
                  )}
                  <ReceiptCell label="MÉTODO" value="Mercado Pago" />
                  {paymentIdShort && (
                    <ReceiptCell label="ID" value={`···${paymentIdShort}`} mono />
                  )}
                </div>
              </Stagger>
            )}

            {/* CTAs */}
            <Stagger mounted={approvedMounted} delay={0.66}>
              <div
                style={{ display: "flex", gap: 10, width: "100%", marginBottom: 14 }}
              >
                {showCvUnlock && result.originAdaptationId && (
                  <>
                    <a
                      href={`/api/cv-adaptation/${result.originAdaptationId}/download?format=pdf`}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!result.originAdaptationId) return;
                        void handleDownload("pdf", result.originAdaptationId);
                      }}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "#0a0a0a",
                        color: "#fafaf6",
                        border: "none",
                        borderRadius: 10,
                        padding: "14px",
                        fontSize: 14,
                        fontWeight: 500,
                        textDecoration: "none",
                        boxShadow:
                          "0 4px 12px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
                        cursor: "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
                          stroke="#fafaf6"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Baixar PDF
                    </a>
                    <a
                      href={`/api/cv-adaptation/${result.originAdaptationId}/download?format=docx`}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!result.originAdaptationId) return;
                        void handleDownload("docx", result.originAdaptationId);
                      }}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "#fff",
                        color: "#0a0a0a",
                        border: "1px solid rgba(10,10,10,0.15)",
                        borderRadius: 10,
                        padding: "13px",
                        fontSize: 14,
                        fontWeight: 500,
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
                          stroke="#0a0a0a"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Baixar DOCX
                    </a>
                  </>
                )}

                {showAdaptation && result.adaptationId && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/adaptar/resultado?adaptationId=${result.adaptationId}`,
                      )
                    }
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#0a0a0a",
                      color: "#fafaf6",
                      border: "none",
                      borderRadius: 10,
                      padding: "14px",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow:
                        "0 4px 12px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
                    }}
                  >
                    Ver e baixar meu CV
                  </button>
                )}

                {!showCvUnlock && !showAdaptation && (
                  <Link
                    href="/adaptar"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#0a0a0a",
                      color: "#fafaf6",
                      borderRadius: 10,
                      padding: "14px",
                      fontSize: 14,
                      fontWeight: 500,
                      textDecoration: "none",
                      boxShadow:
                        "0 4px 12px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
                    }}
                  >
                    Adaptar meu CV agora
                  </Link>
                )}
              </div>
            </Stagger>

            {showCvUnlock && result?.originAdaptationId && (
              <Stagger mounted={approvedMounted} delay={0.72}>
                <Link
                  href={`/adaptar/resultado?adaptationId=${result.originAdaptationId}`}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "center",
                    border: "1px solid rgba(10,10,10,0.15)",
                    borderRadius: 10,
                    padding: "13px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    textDecoration: "none",
                    background: "#fff",
                    marginBottom: 14,
                  }}
                >
                  Ver análise do CV
                </Link>
              </Stagger>
            )}

            <Stagger mounted={approvedMounted} delay={0.78}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: "#6a6560",
                  marginTop: 4,
                }}
              >
                <Link
                  href="/dashboard"
                  style={{
                    color: "#3a3a38",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    textDecorationColor: "rgba(10,10,10,0.2)",
                  }}
                >
                  Ir para o painel
                </Link>
              </div>
            </Stagger>
          </div>
        </div>

        <DownloadProgressOverlay
          open={downloadStage !== null}
          stage={downloadStage}
          format={downloading}
        />
      </div>
    );
  }

  // ── Pending-long ──
  if (state === "pending-long") {
    return (
      <div style={pageStyle}>
        <CheckoutNav crumbActive="PROCESSANDO" />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px 20px",
          }}
        >
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 20,
              padding: "48px 40px",
              maxWidth: 480,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                background: "rgba(245,197,24,0.14)",
                border: "1px solid rgba(245,197,24,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 22px",
              }}
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7a6b15"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "#8a8a85",
                marginBottom: 14,
                fontWeight: 500,
              }}
            >
              CONFIRMAÇÃO EM ANDAMENTO
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: "-0.04em",
                lineHeight: 1.15,
                marginBottom: 14,
              }}
            >
              Aguardando{" "}
              <em style={{ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic" }}>
                confirmação.
              </em>
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#5a5a55",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              Pagamentos via PIX ou boleto podem levar alguns minutos. Assim que
              confirmar, seus créditos e acesso serão liberados automaticamente.
            </p>
            <Link
              href="/adaptar"
              style={{
                display: "block",
                background: "#0a0a0a",
                color: "#fafaf6",
                borderRadius: 10,
                padding: "14px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Voltar para análise e tentar depois
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Failed ──
  if (state === "failed") {
    return (
      <div style={pageStyle}>
        <CheckoutNav crumbActive="NÃO APROVADO" />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px 20px",
          }}
        >
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 20,
              padding: "48px 40px",
              maxWidth: 480,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                background: "rgba(220,38,38,0.07)",
                border: "1px solid rgba(220,38,38,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 22px",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#b91c1c"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "#8a8a85",
                marginBottom: 14,
                fontWeight: 500,
              }}
            >
              PAGAMENTO NÃO APROVADO
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: "-0.04em",
                lineHeight: 1.15,
                marginBottom: 14,
              }}
            >
              Não foi{" "}
              <em style={{ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic" }}>
                aprovado.
              </em>
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#5a5a55",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              O pagamento foi recusado. Verifique os dados do cartão ou tente outro
              método de pagamento.
            </p>
            <Link
              href="/planos"
              style={{
                display: "block",
                background: "#0a0a0a",
                color: "#fafaf6",
                borderRadius: 10,
                padding: "14px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Tentar novamente
            </Link>
            <Link
              href="/adaptar"
              style={{
                fontSize: 13,
                color: "#6a6560",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(10,10,10,0.2)",
              }}
            >
              Voltar para análise e tentar depois
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  return (
    <div style={pageStyle}>
      <CheckoutNav crumbActive="ERRO" />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "30px 20px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#5a5a55", marginBottom: 20 }}>
            Não foi possível verificar o status do pagamento.
          </p>
          <Link
            href="/dashboard"
            style={{
              fontSize: 13,
              color: "#3a3a38",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(10,10,10,0.2)",
            }}
          >
            Ir para o painel
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PagamentoConcluido() {
  return (
    <PageShell>
      {/* Grain overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.45,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
        aria-hidden
      />
      <Suspense
        fallback={
          <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
          </main>
        }
      >
        <ConcluidoContent />
      </Suspense>
    </PageShell>
  );
}
