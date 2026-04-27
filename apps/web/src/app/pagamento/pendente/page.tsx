"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { getCheckoutStatus } from "@/lib/payments-api";

type UIState = "waiting" | "approved" | "failed" | "timeout";

const MAX_POLLS = 150; // ~5 minutos para PIX/boleto
const POLL_INTERVAL_MS = 2000;

function PendenteContent() {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkoutId");

  const [state, setState] = useState<UIState>("waiting");
  const [adaptationId, setAdaptationId] = useState<string | null>(null);
  const pollCount = useRef(0);
  const polling = useRef(false);

  const startPolling = useCallback(() => {
    if (!checkoutId || polling.current) return;
    polling.current = true;
    pollCount.current = 0;

    const poll = async () => {
      try {
        const data = await getCheckoutStatus(checkoutId);

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
  }, [checkoutId]);

  useEffect(() => {
    startPolling();
  }, [startPolling]);

  return (
    <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
      {state === "waiting" && (
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm text-center">
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

          <Link
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Ir para o painel
          </Link>
        </div>
      )}

      {state === "approved" && (
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm text-center">
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
            Seus créditos estão disponíveis.
          </p>

          {adaptationId ? (
            <Link
              href={`/adaptar/${adaptationId}/resultado`}
              style={{ color: "#ffffff" }}
              className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222]"
            >
              Ver e baixar meu CV
            </Link>
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
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm text-center">
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
            O pagamento ainda não foi confirmado pelo Mercado Pago. Pode levar
            alguns minutos para PIX e boleto.
          </p>
          <p className="text-gray-400 text-xs mb-8">
            Assim que confirmar, seus créditos serão liberados automaticamente.
            Você pode verificar novamente ou ir ao painel.
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
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Ir para o painel
          </Link>
        </div>
      )}

      {state === "failed" && (
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm text-center">
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
        </div>
      )}
    </main>
  );
}

export default function PagamentoPendente() {
  return (
    <PageShell>
      <Suspense
        fallback={
          <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
          </main>
        }
      >
        <PendenteContent />
      </Suspense>
    </PageShell>
  );
}
