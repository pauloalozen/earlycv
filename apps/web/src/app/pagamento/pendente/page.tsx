"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import { PageShell } from "@/components/page-shell";
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
          <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center mx-auto mb-6">
            <svg
              aria-hidden="true"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-yellow-500"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
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
          <p className="text-gray-400 text-xs mb-8">
            Para pagamentos via PIX ou boleto, isso pode levar alguns minutos.
          </p>

          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-2 w-2 rounded-full bg-yellow-400 animate-bounce" />
            <div
              className="h-2 w-2 rounded-full bg-yellow-400 animate-bounce"
              style={{ animationDelay: "0.15s" }}
            />
            <div
              className="h-2 w-2 rounded-full bg-yellow-400 animate-bounce"
              style={{ animationDelay: "0.3s" }}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleResumeCheckout()}
            disabled={isResuming}
            className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center text-white transition-colors hover:bg-[#222222] mb-3 disabled:opacity-60"
          >
            {isResuming ? "Abrindo Pix..." : "Abrir Pix novamente"}
          </button>
          {resumeError && (
            <p className="text-xs text-red-600 mb-3">{resumeError}</p>
          )}
          <Link
            href="/compras"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Voltar para minhas compras
          </Link>
        </div>
      )}

      {state === "approved" && (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-lime-100 flex items-center justify-center mx-auto mb-6">
            <svg
              aria-hidden="true"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-lime-600"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Pagamento confirmado!
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            Seus créditos já estão disponíveis e seu cv já está liberado.
          </p>

          {adaptationId ? (
            <>
              <a
                href={`/api/cv-adaptation/${adaptationId}/download?format=pdf`}
                style={{ color: "#ffffff" }}
                className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222] mb-3"
              >
                Baixar PDF
              </a>
              <a
                href={`/api/cv-adaptation/${adaptationId}/download?format=docx`}
                className="block w-full rounded-[14px] border border-[#D0D0D0] bg-white py-[14px] text-base font-medium leading-none text-center text-[#111111] transition-colors hover:bg-[#F5F5F5] mb-3"
              >
                Baixar DOCX
              </a>
              <Link
                href={`/adaptar/resultado?adaptationId=${adaptationId}`}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Voltar para análise e baixar depois
              </Link>
            </>
          ) : (
            <Link
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222]"
            >
              Adaptar meu CV agora
            </Link>
          )}
        </div>
      )}

      {state === "timeout" && (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center mx-auto mb-6">
            <svg
              aria-hidden="true"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-yellow-500"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
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
            className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center text-white transition-colors hover:bg-[#222222] mb-3"
          >
            Verificar novamente
          </button>
          <Link
            href="/adaptar"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Voltar para análise e tentar depois
          </Link>
        </div>
      )}

      {state === "failed" && (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
            <svg
              aria-hidden="true"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
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
            className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222]"
          >
            Tentar novamente
          </Link>
          <Link
            href="/adaptar"
            className="mt-4 inline-block text-sm text-gray-500 hover:text-gray-700"
          >
            Voltar para análise e tentar depois
          </Link>
        </div>
      )}
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
