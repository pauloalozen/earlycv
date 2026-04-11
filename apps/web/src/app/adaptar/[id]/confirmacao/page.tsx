"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { confirmCvAdaptationPayment } from "@/lib/cv-adaptation-api";

type UIState = "confirming" | "approved" | "rejected" | "pending" | "error";

export default function ConfirmacaoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [state, setState] = useState<UIState>("confirming");

  useEffect(() => {
    const collectionStatus = searchParams.get("collection_status");
    const status = searchParams.get("status");
    const mpStatus = collectionStatus ?? status;

    if (mpStatus === "rejected") {
      setState("rejected");
      return;
    }

    if (mpStatus === "pending" || mpStatus === "in_process") {
      setState("pending");
      return;
    }

    // approved or no status yet — try to confirm on the backend
    confirmCvAdaptationPayment(params.id)
      .then(() => setState("approved"))
      .catch(() => setState("error"));
  }, [params.id, searchParams]);

  if (state === "confirming") {
    return (
      <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
        <div className="text-center">
          <svg
            aria-hidden="true"
            className="animate-spin mx-auto mb-4 text-gray-400"
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <p className="text-gray-500 text-sm">Confirmando pagamento...</p>
        </div>
      </main>
    );
  }

  if (state === "approved") {
    return (
      <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
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
            Seu CV adaptado está pronto. Clique abaixo para ver e baixar.
          </p>

          <button
            type="button"
            onClick={() => router.push(`/adaptar/${params.id}/resultado`)}
            style={{ color: "#ffffff" }}
            className="w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none transition-colors hover:bg-[#222222]"
          >
            Ver e baixar meu CV
          </button>
        </div>
      </main>
    );
  }

  if (state === "rejected" || state === "error") {
    return (
      <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
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
            Não foi possível receber o pagamento
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            O pagamento foi recusado. Verifique os dados do cartão ou tente
            outro método e tente novamente.
          </p>

          <button
            type="button"
            onClick={() => router.push(`/adaptar/${params.id}/checkout`)}
            style={{ color: "#ffffff" }}
            className="w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none transition-colors hover:bg-[#222222]"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  // pending / in_process
  return (
    <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
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
          Pagamento em processamento
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          Seu pagamento está sendo processado. Assim que confirmado, seu CV
          adaptado ficará disponível.
        </p>

        <button
          type="button"
          onClick={() => router.push(`/adaptar/${params.id}/resultado`)}
          style={{ color: "#ffffff" }}
          className="w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none transition-colors hover:bg-[#222222]"
        >
          Acompanhar resultado
        </button>
      </div>
    </main>
  );
}
