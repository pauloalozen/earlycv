"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
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

function ConcluidoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkoutId");

  const [state, setState] = useState<UIState>("polling");
  const [result, setResult] = useState<CheckoutStatusResponse | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const pollCount = useRef(0);

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

  return (
    <AuthMonoShell>
      {state === "polling" && (
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111] mx-auto mb-4" />
          <p className="text-sm text-gray-500">Confirmando pagamento...</p>
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
            Pagamento aprovado!
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            {result?.message ??
              (result?.type === "plan"
                ? "Seus créditos estão disponíveis no painel."
                : "Seu CV adaptado está pronto.")}
          </p>

          {result?.originAction === "unlock_cv" && result.autoUnlockError && (
            <p className="text-sm text-amber-700 mb-4">
              Seu pagamento foi aprovado e os créditos foram adicionados. Não
              conseguimos liberar automaticamente este CV, mas você pode
              liberá-lo manualmente.
            </p>
          )}

          {result?.originAction === "unlock_cv" &&
            result.originAdaptationId &&
            result.autoUnlockProcessedAt &&
            !result.autoUnlockError &&
            result.adaptationUnlocked && (
              <>
                <a
                  href={`/api/cv-adaptation/${result.originAdaptationId}/download?format=pdf`}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!result.originAdaptationId) {
                      return;
                    }
                    void handleDownload("pdf", result.originAdaptationId);
                  }}
                  style={{ color: "#ffffff" }}
                  className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222] mb-3"
                >
                  Baixar PDF
                </a>
                <a
                  href={`/api/cv-adaptation/${result.originAdaptationId}/download?format=docx`}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!result.originAdaptationId) {
                      return;
                    }
                    void handleDownload("docx", result.originAdaptationId);
                  }}
                  className="block w-full rounded-[14px] border border-[#D0D0D0] bg-white py-[14px] text-base font-medium leading-none text-center text-[#111111] transition-colors hover:bg-[#F5F5F5] mb-3"
                >
                  Baixar DOCX
                </a>
                <Link
                  href={`/adaptar/resultado?adaptationId=${result.originAdaptationId}`}
                  className="block w-full rounded-[14px] border border-[#D0D0D0] bg-white py-[14px] text-base font-medium leading-none text-center text-[#111111] transition-colors hover:bg-[#F5F5F5]"
                >
                  Ver análise do CV
                </Link>
              </>
            )}

          {result?.type === "adaptation" && result.adaptationId ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/adaptar/resultado?adaptationId=${result.adaptationId}`,
                )
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
            Confirmação em andamento
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            Ainda estamos aguardando a confirmação do pagamento. Em pagamentos
            via PIX ou boleto, isso pode levar alguns minutos. Assim que
            confirmar, seus créditos e acesso serão liberados automaticamente.
          </p>

          <Link
            href="/adaptar"
            style={{ color: "#ffffff" }}
            className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222]"
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
          <Link
            href="/adaptar"
            className="mt-4 inline-block text-sm text-gray-500 hover:text-gray-700"
          >
            Voltar para análise e tentar depois
          </Link>
        </div>
      )}

      {state === "error" && (
        <div className="text-center">
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
      <DownloadProgressOverlay
        open={downloadStage !== null}
        stage={downloadStage}
        format={downloading}
      />
    </AuthMonoShell>
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
