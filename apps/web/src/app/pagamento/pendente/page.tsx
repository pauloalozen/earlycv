"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import {
  getCheckoutStatusClient,
  resumeCheckoutClient,
} from "@/lib/payments-browser-api";

type UIState = "waiting" | "approved" | "failed" | "timeout";

const MAX_POLLS = 150; // ~5 minutos para PIX/boleto
const POLL_INTERVAL_MS = 2000;

function PendenteContent() {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkoutId");
  const shouldAutoResume = searchParams.get("resume") === "1";
  const mpPaymentId =
    searchParams.get("payment_id") ?? searchParams.get("collection_id");
  const mpPreferenceId = searchParams.get("preference_id");
  const mpRawStatus = searchParams.get("status");
  const mpCollectionStatus = searchParams.get("collection_status");
  const mpStatus = mpRawStatus ?? mpCollectionStatus;

  const [state, setState] = useState<UIState>("waiting");
  const [adaptationId, setAdaptationId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const pollCount = useRef(0);
  const polling = useRef(false);
  const triedAutoResume = useRef(false);

  const startPolling = useCallback(() => {
    if (!checkoutId || polling.current) return;
    polling.current = true;
    pollCount.current = 0;

    const poll = async () => {
      try {
        const data = await getCheckoutStatusClient(checkoutId, {
          paymentId: mpPaymentId,
          preferenceId: mpPreferenceId,
          status: mpRawStatus,
          collectionStatus: mpCollectionStatus,
        });

        if (data.nextAction === "show_success") {
          setAdaptationId(data.adaptationId);
          setState("approved");
          polling.current = false;
          return;
        }

        if (
          data.nextAction === "show_failure" ||
          data.nextAction === "retry_payment"
        ) {
          setState("failed");
          polling.current = false;
          return;
        }

        pollCount.current += 1;
        if (pollCount.current < MAX_POLLS) {
          setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setState("timeout");
          polling.current = false;
        }
      } catch {
        pollCount.current += 1;
        if (pollCount.current < MAX_POLLS) {
          setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setState("timeout");
          polling.current = false;
        }
      }
    };

    poll();
  }, [
    checkoutId,
    mpCollectionStatus,
    mpPaymentId,
    mpPreferenceId,
    mpRawStatus,
  ]);

  const handleResumeCheckout = useCallback(async () => {
    if (!checkoutId || isResuming) return;
    setIsResuming(true);
    setResumeError(null);

    try {
      const data = await resumeCheckoutClient(checkoutId);
      window.location.href = data.checkoutUrl;
    } catch {
      setResumeError(
        "Nao foi possivel abrir o Pix agora. Tente novamente em alguns instantes.",
      );
      setIsResuming(false);
    }
  }, [checkoutId, isResuming]);

  const handleDownload = useCallback(
    async (format: "pdf" | "docx", targetAdaptationId: string) => {
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
    },
    [downloading],
  );

  useEffect(() => {
    startPolling();
  }, [startPolling]);

  useEffect(() => {
    if (!shouldAutoResume || triedAutoResume.current) return;
    triedAutoResume.current = true;
    void handleResumeCheckout();
  }, [handleResumeCheckout, shouldAutoResume]);

  useEffect(() => {
    if (!checkoutId) return;
    if (!mpPaymentId && !mpPreferenceId && !mpStatus) return;
    console.info("[payment-pending:return]", {
      checkoutId,
      payment_id: mpPaymentId,
      preference_id: mpPreferenceId,
      status: mpStatus,
    });
  }, [checkoutId, mpPaymentId, mpPreferenceId, mpStatus]);

  return (
    <AuthMonoShell>
      {state === "waiting" && (
        <div className="text-center">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(245,197,24,0.12)",
              border: "1px solid rgba(245,197,24,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              aria-hidden="true"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#f5c518"
                strokeWidth="1.5"
              />
              <path
                d="M12 7v5l3 3"
                stroke="#f5c518"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Pagamento pendente
          </h1>
          <p className="text-gray-500 text-sm mb-2">
            Seu pagamento está aguardando confirmação. Assim que aprovado, seus
            créditos serão liberados automaticamente.
          </p>
          <p className="text-gray-500 text-sm mb-2">
            Pagamento pendente. Se você ainda não concluiu o Pix, pode abrir o
            pagamento novamente.
          </p>
          <p
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "#a0a098",
              letterSpacing: 0.2,
              marginBottom: 20,
              lineHeight: 1.5,
              maxWidth: 320,
              margin: "0 auto 20px",
            }}
          >
            Para pagamentos via PIX ou boleto, isso pode levar alguns minutos.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#f5c518",
                display: "inline-block",
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#f5c518",
                opacity: 0.5,
                display: "inline-block",
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#f5c518",
                opacity: 0.25,
                display: "inline-block",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleResumeCheckout()}
            disabled={isResuming}
            className="block w-full rounded-[10px] bg-[#0a0a0a] py-[14px] text-[14.5px] font-medium leading-none text-center text-white transition-colors hover:bg-[#222222] mb-3 disabled:opacity-60"
          >
            {isResuming ? "Abrindo Pix..." : "Abrir Pix novamente"}
          </button>
          {resumeError && (
            <p className="text-xs text-red-600 mb-3">{resumeError}</p>
          )}
          <Link
            href="/compras"
            style={{
              background: "transparent",
              color: "#6a6560",
              fontSize: 13,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(10,10,10,0.2)",
            }}
          >
            Voltar para minhas compras
          </Link>
        </div>
      )}

      {state === "approved" && (
        <div className="text-center">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(198,255,58,0.18)",
              border: "1px solid rgba(110,150,20,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M5 12l5 5L20 7"
                stroke="#405410"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Pagamento confirmado!
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#45443e",
              lineHeight: 1.6,
              marginBottom: 8,
              maxWidth: 340,
              margin: "0 auto 8px",
            }}
          >
            Seus créditos já estão disponíveis e seu CV já está liberado.
          </p>

          <div
            style={{
              width: "100%",
              height: 1,
              background: "rgba(10,10,10,0.06)",
              margin: "20px 0",
            }}
          />

          {adaptationId ? (
            <>
              <a
                href={`/api/cv-adaptation/${adaptationId}/download?format=pdf`}
                onClick={(event) => {
                  event.preventDefault();
                  void handleDownload("pdf", adaptationId);
                }}
                style={{ color: "#ffffff" }}
                className="block w-full rounded-[10px] bg-[#0a0a0a] py-[14px] text-[14.5px] font-medium leading-none text-center transition-colors hover:bg-[#222222] mb-3"
              >
                Baixar PDF
              </a>
              <a
                href={`/api/cv-adaptation/${adaptationId}/download?format=docx`}
                onClick={(event) => {
                  event.preventDefault();
                  void handleDownload("docx", adaptationId);
                }}
                className="block w-full rounded-[10px] border border-[rgba(10,10,10,0.15)] bg-white py-[13px] text-[14.5px] font-medium leading-none text-center text-[#0a0a0a] transition-colors hover:bg-[#F5F5F5] mb-3"
              >
                Baixar DOCX
              </a>
              <Link
                href={`/adaptar/resultado?adaptationId=${adaptationId}`}
                style={{
                  background: "transparent",
                  color: "#6a6560",
                  fontSize: 13,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationColor: "rgba(10,10,10,0.2)",
                }}
              >
                Voltar para análise e baixar depois
              </Link>
            </>
          ) : (
            <Link
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="block w-full rounded-[10px] bg-[#0a0a0a] py-[14px] text-[14.5px] font-medium leading-none text-center transition-colors hover:bg-[#222222]"
            >
              Adaptar meu CV agora
            </Link>
          )}
        </div>
      )}

      {state === "timeout" && (
        <div className="text-center">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(245,197,24,0.12)",
              border: "1px solid rgba(245,197,24,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              aria-hidden="true"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#f5c518"
                strokeWidth="1.5"
              />
              <path
                d="M12 7v5l3 3"
                stroke="#f5c518"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Ainda aguardando confirmação
          </h1>
          <p className="text-gray-500 text-sm mb-2">
            Ainda estamos aguardando a confirmação do pagamento.
          </p>
          <p className="text-gray-400 text-xs mb-8">
            Em pagamentos via PIX ou boleto, isso pode levar alguns minutos.
            Assim que confirmar, seus créditos serão liberados automaticamente.
          </p>

          <button
            type="button"
            onClick={() => {
              setState("waiting");
              startPolling();
            }}
            className="block w-full rounded-[10px] bg-[#0a0a0a] py-[14px] text-[14.5px] font-medium leading-none text-center text-white transition-colors hover:bg-[#222222] mb-3"
          >
            Verificar novamente
          </button>
          <Link
            href="/adaptar"
            style={{
              color: "#6a6560",
              fontSize: 13,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(10,10,10,0.2)",
            }}
          >
            Voltar para análise e tentar depois
          </Link>
        </div>
      )}

      {state === "failed" && (
        <div className="text-center">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#ef4444"
                strokeWidth="1.5"
              />
              <path
                d="M15 9l-6 6M9 9l6 6"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Pagamento não aprovado
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            O pagamento foi recusado ou expirou. Tente novamente.
          </p>

          <Link
            href="/planos"
            style={{ color: "#ffffff" }}
            className="block w-full rounded-[10px] bg-[#0a0a0a] py-[14px] text-[14.5px] font-medium leading-none text-center transition-colors hover:bg-[#222222]"
          >
            Tentar novamente
          </Link>
          <Link
            href="/adaptar"
            style={{
              display: "inline-block",
              marginTop: 16,
              color: "#6a6560",
              fontSize: 13,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(10,10,10,0.2)",
            }}
          >
            Voltar para análise e tentar depois
          </Link>
        </div>
      )}
      <DownloadProgressOverlay
        open={downloadStage !== null}
        stage={downloadStage}
        format={downloading}
      />
    </AuthMonoShell>
  );
}

export default function PagamentoPendente() {
  return (
    <PageShell>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center p-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
          </main>
        }
      >
        <PendenteContent />
      </Suspense>
    </PageShell>
  );
}
