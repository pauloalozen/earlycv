"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";
import {
  type CheckoutStatusResponse,
  getCheckoutStatus,
} from "@/lib/payments-api";

type UIState = "polling" | "approved" | "pending-long" | "failed" | "error";

const MAX_POLLS = 15;
const POLL_INTERVAL_MS = 2000;

function ConcluidoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkoutId");

  const [state, setState] = useState<UIState>("polling");
  const [result, setResult] = useState<CheckoutStatusResponse | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!checkoutId) {
      setState("error");
      return;
    }

    const poll = async () => {
      try {
        const data = await getCheckoutStatus(checkoutId);
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

  return (
    <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
      {state === "polling" && (
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111] mx-auto mb-4" />
          <p className="text-sm text-gray-500">Confirmando pagamento...</p>
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
            Pagamento aprovado!
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            {result?.message ??
              (result?.type === "plan"
                ? "Seus créditos estão disponíveis no painel."
                : "Seu CV adaptado está pronto.")}
          </p>

          {result?.type === "adaptation" && result.adaptationId ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/adaptar/${result.adaptationId}/resultado`)
              }
              style={{ color: "#ffffff" }}
              className="w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none transition-colors hover:bg-[#222222]"
            >
              Ver e baixar meu CV
            </button>
          ) : (
            <Link
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222]"
            >
              Adaptar meu CV agora
            </Link>
          )}

          <Link
            href="/dashboard"
            className="mt-4 block text-sm text-gray-400 hover:text-gray-600"
          >
            Ir para o painel
          </Link>
        </div>
      )}

      {state === "pending-long" && (
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
            Confirmação em andamento
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            Seu pagamento está sendo processado. Pode levar alguns minutos.
            Assim que confirmado, você receberá acesso automaticamente.
          </p>

          <Link
            href="/dashboard"
            style={{ color: "#ffffff" }}
            className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222]"
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
            O pagamento foi recusado. Verifique os dados do cartão ou tente
            outro método.
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

      {state === "error" && (
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm text-center">
          <p className="text-gray-500 text-sm mb-6">
            Não foi possível verificar o status do pagamento.
          </p>
          <Link
            href="/dashboard"
            className="text-sm text-gray-700 underline underline-offset-4"
          >
            Ir para o painel
          </Link>
        </div>
      )}
    </main>
  );
}

export default function PagamentoConcluido() {
  return (
    <PageShell>
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
