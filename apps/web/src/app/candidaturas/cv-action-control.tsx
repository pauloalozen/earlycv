"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCompanyDisplayName } from "@/app/radar/company-logo";
import { EcvBuildLoader } from "@/components/ecv-loader";
import { downloadFromApi } from "@/lib/client-download";
import { buildCvUnlockPlansHref } from "@/lib/cv-unlock-flow";
import type { JobApplicationDto } from "@/lib/job-applications-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Ação de CV da candidatura (baixar o melhor CV, ou liberar com 1 crédito),
// com o overlay de download e os modais de confirmação / sem créditos.
// Extraído da linha da lista (CandRow) pra ser usado também pelo card do
// quadro (kanban) — mesmo fluxo, mesmas chamadas.
// `compact`: botão menor, pro card do quadro.
export function CvActionControl({
  application,
  hasCredits,
  compact = false,
}: {
  application: JobApplicationDto;
  hasCredits: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [confirmUnlockVisible, setConfirmUnlockVisible] = useState(false);
  const [noCreditsOpen, setNoCreditsOpen] = useState(false);
  const [noCreditsVisible, setNoCreditsVisible] = useState(false);
  const noCreditsCloseTimerRef = useRef<number | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const cvAdaptationIdForActions =
    application.bestCvAdaptationId ?? application.currentCvAdaptationId;
  const canDownloadCv =
    cvAdaptationIdForActions !== null && application.bestCvState !== "locked";
  const buttonPadding = compact ? "0 11px" : "10px 14px";
  const buttonFontSize = compact ? 12 : 12.5;
  const buttonHeight = compact ? 32 : undefined;

  const handleRedeem = async () => {
    if (!cvAdaptationIdForActions || redeeming) return;
    setRedeeming(true);
    setRedeemError(null);

    let storedKeywords: string[] = [];
    try {
      const raw = sessionStorage.getItem(`kw_sel_${cvAdaptationIdForActions}`);
      if (raw) storedKeywords = JSON.parse(raw) as string[];
    } catch {
      // unavailable or malformed
    }

    try {
      const response = await fetch(
        `/api/cv-adaptation/${cvAdaptationIdForActions}/redeem-credit`,
        {
          method: "POST",
          cache: "no-store",
          ...(storedKeywords.length > 0
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  selectedMissingKeywords: storedKeywords,
                }),
              }
            : {}),
        },
      );
      if (!response.ok) {
        let apiMessage =
          "Nao foi possivel liberar o CV agora. Tente novamente.";
        try {
          const body = (await response.json()) as { message?: string };
          if (typeof body.message === "string" && body.message.trim()) {
            apiMessage = body.message;
          }
        } catch {
          // no-op
        }
        throw new Error(apiMessage);
      }
      router.push(`/adaptacao-cv/${cvAdaptationIdForActions}`);
    } catch (error) {
      if (error instanceof TypeError) {
        setRedeemError(
          "Nao foi possivel conectar ao servidor. Verifique sua internet e tente novamente.",
        );
      } else if (error instanceof Error && error.message) {
        setRedeemError(error.message);
      } else {
        setRedeemError("Nao foi possivel liberar o CV agora. Tente novamente.");
      }
    } finally {
      setRedeeming(false);
    }
  };

  const handleDownloadCv = async () => {
    if (!cvAdaptationIdForActions || downloading) return;
    setDownloading(true);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${cvAdaptationIdForActions}/download?format=pdf`,
        fallbackFilename: "cv-adaptado.pdf",
      });
    } catch {
      // silently ignore — browser may have blocked or download failed
    } finally {
      setDownloading(false);
    }
  };

  const openNoCreditsModal = () => {
    setNoCreditsOpen(true);
    setNoCreditsVisible(false);
    window.requestAnimationFrame(() => setNoCreditsVisible(true));
  };

  const closeNoCreditsModal = () => {
    setNoCreditsVisible(false);
    if (noCreditsCloseTimerRef.current) {
      window.clearTimeout(noCreditsCloseTimerRef.current);
    }
    noCreditsCloseTimerRef.current = window.setTimeout(() => {
      setNoCreditsOpen(false);
    }, 200);
  };

  const openUnlockModal = () => {
    if (!hasCredits) {
      openNoCreditsModal();
      return;
    }
    setRedeemError(null);
    setConfirmUnlock(true);
    setConfirmUnlockVisible(false);
    window.requestAnimationFrame(() => setConfirmUnlockVisible(true));
  };

  const closeUnlockModal = () => {
    setConfirmUnlockVisible(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setConfirmUnlock(false);
      setRedeemError(null);
      closeTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (noCreditsCloseTimerRef.current) {
        window.clearTimeout(noCreditsCloseTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {canDownloadCv && cvAdaptationIdForActions ? (
        <>
          <button
            type="button"
            onClick={() => void handleDownloadCv()}
            disabled={downloading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 8,
              padding: buttonPadding,
              height: buttonHeight,
              fontSize: buttonFontSize,
              fontWeight: 500,
              cursor: downloading ? "default" : "pointer",
              fontFamily: GEIST,
              background: "#fff",
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.12)",
              whiteSpace: "nowrap",
              opacity: downloading ? 0.6 : 1,
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 4v11" strokeLinecap="round" />
              <path
                d="m8 11 4 4 4-4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M5 20h14" strokeLinecap="round" />
            </svg>
            <span>{compact ? "Baixar CV" : "Baixar melhor CV"}</span>
          </button>

          {/* Overlay de download */}
          {downloading && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 16px",
                background: "rgba(10,10,10,0.5)",
                backdropFilter: "blur(4px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 20,
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "#0a0a0a",
                  padding: "32px",
                  width: "100%",
                  maxWidth: 380,
                  boxShadow: "0 32px 80px -16px rgba(0,0,0,0.8)",
                }}
              >
                <EcvBuildLoader size={64} dark />
                <div style={{ textAlign: "center" }}>
                  <p
                    style={{
                      fontFamily: GEIST,
                      fontSize: 15,
                      fontWeight: 500,
                      letterSpacing: -0.2,
                      color: "#fafaf6",
                      margin: "0 0 6px",
                    }}
                  >
                    Preparando download...
                  </p>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#5a5a55",
                      margin: 0,
                      letterSpacing: 0.3,
                    }}
                  >
                    GERANDO PDF DO CV OTIMIZADO
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : application.bestCvState === "locked" && cvAdaptationIdForActions ? (
        <button
          type="button"
          onClick={openUnlockModal}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 8,
            padding: buttonPadding,
            height: buttonHeight,
            fontSize: buttonFontSize,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: GEIST,
            textDecoration: "none",
            background: "#fff",
            color: "#0a0a0a",
            border: "1px solid rgba(10,10,10,0.12)",
            whiteSpace: "nowrap",
          }}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 1 1 8 0" strokeLinecap="round" />
          </svg>
          <span>Liberar CV · 1 crédito</span>
        </button>
      ) : application.bestCvState === "missing" && !compact ? (
        <button
          type="button"
          disabled
          style={{
            borderRadius: 8,
            padding: buttonPadding,
            height: buttonHeight,
            fontSize: buttonFontSize,
            fontWeight: 500,
            fontFamily: GEIST,
            border: "1px solid rgba(10,10,10,0.08)",
            background: "#f4f4f2",
            color: "#9a9993",
            cursor: "not-allowed",
          }}
        >
          CV indisponível
        </button>
      ) : null}
      {confirmUnlock ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,10,10,0.35)",
            padding: "0 16px",
            transition: "opacity 180ms ease",
            opacity: confirmUnlockVisible ? 1 : 0,
          }}
        >
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => {
              if (!redeeming) closeUnlockModal();
            }}
            style={{
              position: "absolute",
              inset: 0,
              border: 0,
              background: "transparent",
              cursor: "pointer",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              border: "1px solid rgba(10,10,10,0.12)",
              borderRadius: 16,
              padding: "20px 18px",
              boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
              transition: "opacity 180ms ease, transform 180ms ease",
              opacity: confirmUnlockVisible ? 1 : 0,
              transform: confirmUnlockVisible
                ? "translateY(0) scale(1)"
                : "translateY(6px) scale(0.98)",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 16,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              Liberar CV
            </p>
            <div
              style={{
                margin: "0 0 12px",
                padding: "8px 10px",
                background: "rgba(10,10,10,0.04)",
                borderRadius: 8,
                border: "1px solid rgba(10,10,10,0.08)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "#0a0a0a",
                  lineHeight: 1.3,
                }}
              >
                {application.jobTitle}
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "#6a6a65",
                }}
              >
                {getCompanyDisplayName(application.companyName)}
              </p>
            </div>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13.5,
                color: "#55524d",
                lineHeight: 1.45,
              }}
            >
              Será usado 1 crédito para liberar o download deste CV adaptado.
            </p>
            {redeemError ? (
              <p
                style={{
                  margin: "-8px 0 12px",
                  fontSize: 12,
                  color: "#991b1b",
                }}
              >
                {redeemError}
              </p>
            ) : null}
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                onClick={() => closeUnlockModal()}
                disabled={redeeming}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(10,10,10,0.12)",
                  background: "#fff",
                  color: "#0a0a0a",
                  fontSize: 12,
                  padding: "8px 10px",
                  cursor: redeeming ? "not-allowed" : "pointer",
                  fontFamily: GEIST,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleRedeem()}
                disabled={redeeming}
                style={{
                  borderRadius: 8,
                  border: "1px solid #0a0a0a",
                  background: "#0a0a0a",
                  color: "#fff",
                  fontSize: 12,
                  padding: "8px 10px",
                  cursor: redeeming ? "not-allowed" : "pointer",
                  fontFamily: GEIST,
                }}
              >
                {redeeming ? "Liberando..." : "Confirmar liberação"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noCreditsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cand-no-credits-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,10,10,0.35)",
            padding: "0 16px",
            transition: "opacity 180ms ease",
            opacity: noCreditsVisible ? 1 : 0,
          }}
        >
          <button
            type="button"
            aria-label="Fechar"
            onClick={closeNoCreditsModal}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "default",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              maxWidth: 420,
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 18,
              padding: "28px 28px 24px",
              fontFamily: GEIST,
              boxShadow: "0 24px 60px -20px rgba(10,10,10,0.4)",
              transition: "opacity 200ms ease-out, transform 200ms ease-out",
              opacity: noCreditsVisible ? 1 : 0,
              transform: noCreditsVisible
                ? "translateY(0) scale(1)"
                : "translateY(8px) scale(0.98)",
            }}
          >
            <h3
              id="cand-no-credits-title"
              style={{
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: "-0.4px",
                color: "#0a0a0a",
                margin: "0 0 8px",
                fontFamily: GEIST,
              }}
            >
              Sem créditos disponíveis
            </h3>
            <p
              style={{
                fontSize: 13.5,
                color: "#6a6560",
                lineHeight: 1.55,
                margin: "0 0 24px",
                fontFamily: GEIST,
              }}
            >
              Você não tem créditos para liberar este CV. Adquira um crédito
              para gerar o CV adaptado desta vaga.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={buildCvUnlockPlansHref({
                  adaptationId: cvAdaptationIdForActions,
                  source: "resultado-buy-credits",
                })}
                style={{
                  display: "block",
                  textAlign: "center",
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  fontFamily: GEIST,
                }}
              >
                Comprar crédito
              </a>
              <button
                type="button"
                onClick={closeNoCreditsModal}
                style={{
                  display: "block",
                  width: "100%",
                  background: "transparent",
                  color: "#6a6560",
                  border: "1px solid rgba(10,10,10,0.10)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: GEIST,
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
