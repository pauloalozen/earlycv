"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { confirmCvAdaptationPayment } from "@/lib/cv-adaptation-api";

type State = "confirming" | "confirmed" | "error";

export default function ConfirmacaoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<State>("confirming");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    confirmCvAdaptationPayment(params.id)
      .then(() => {
        setState("confirmed");
        setTimeout(() => {
          router.push(`/adaptar/${params.id}/resultado`);
        }, 2000);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Erro ao confirmar pagamento",
        );
        setState("error");
      });
  }, [params.id, router]);

  if (state === "confirming") {
    return (
      <main className="min-h-screen bg-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
          <p className="text-lg font-medium">Confirmando pagamento...</p>
        </div>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="min-h-screen bg-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-4">
            {error}
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Se você já pagou, aguarde alguns instantes e tente novamente.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setState("confirming");
                setError(null);
                confirmCvAdaptationPayment(params.id)
                  .then(() => {
                    setState("confirmed");
                    setTimeout(
                      () => router.push(`/adaptar/${params.id}/resultado`),
                      2000,
                    );
                  })
                  .catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Erro ao confirmar pagamento",
                    );
                    setState("error");
                  });
              }}
              className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-600"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => router.push(`/adaptar/${params.id}/resultado`)}
              className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300"
            >
              Ver resultado
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-200 p-8 rounded-lg text-center">
          <svg
            aria-label="Pagamento confirmado"
            className="w-16 h-16 text-green-600 mx-auto mb-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <h1 className="text-3xl font-bold mb-2 text-green-800">
            Pagamento Confirmado!
          </h1>
          <p className="text-gray-600 mb-6">
            Redirecionando para seu CV adaptado...
          </p>
          <button
            type="button"
            onClick={() => router.push(`/adaptar/${params.id}/resultado`)}
            className="bg-orange-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-orange-600"
          >
            Ir agora
          </button>
        </div>
      </div>
    </main>
  );
}
