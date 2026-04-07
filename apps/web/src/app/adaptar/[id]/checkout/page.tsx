"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CvAdaptationDto } from "@/lib/cv-adaptation-api";
import { createCheckoutIntent, getCvAdaptation } from "@/lib/cv-adaptation-api";

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [adaptation, setAdaptation] = useState<CvAdaptationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchAdaptation = async () => {
      try {
        const data = await getCvAdaptation(params.id);
        setAdaptation(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load adaptation",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAdaptation();
  }, [params.id]);

  const handleCheckout = async () => {
    if (!adaptation) return;

    setProcessing(true);
    try {
      const { checkoutUrl } = await createCheckoutIntent(adaptation.id);
      // Redirect to payment provider
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create checkout",
      );
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </main>
    );
  }

  if (error || !adaptation) {
    return (
      <main className="min-h-screen bg-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
            {error || "Adaptation not found"}
          </div>
          <button
            type="button"
            onClick={() => router.push("/adaptar")}
            className="mt-4 bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Voltar
          </button>
        </div>
      </main>
    );
  }

  if (adaptation.status !== "awaiting_payment") {
    return (
      <main className="min-h-screen bg-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg mb-4">
            Esta vaga não está aguardando pagamento. Status atual:{" "}
            {adaptation.status}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/adaptar/${adaptation.id}/resultado`)}
            className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Voltar ao resultado
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-blue-50 border border-blue-200 p-8 rounded-lg">
          <h1 className="text-3xl font-bold mb-6 text-blue-900">
            Desbloqueie seu CV Adaptado
          </h1>

          <div className="space-y-4 mb-8">
            {adaptation.jobTitle && (
              <div>
                <p className="text-gray-600">
                  <strong>Vaga:</strong> {adaptation.jobTitle}
                </p>
              </div>
            )}

            {adaptation.companyName && (
              <div>
                <p className="text-gray-600">
                  <strong>Empresa:</strong> {adaptation.companyName}
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-blue-200">
              <p className="text-gray-600 mb-2">
                <strong>Valor:</strong>
              </p>
              <div className="text-5xl font-bold text-orange-500">R$ 19,00</div>
              <p className="text-sm text-gray-500 mt-2">
                Acesso ao CV adaptado + download em PDF
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={processing}
              className="w-full bg-orange-500 text-white font-semibold py-3 rounded-lg hover:bg-orange-600 disabled:bg-gray-400"
            >
              {processing ? "Processando..." : "Continuar para Pagamento"}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/adaptar/${adaptation.id}/resultado`)}
              disabled={processing}
              className="w-full bg-gray-200 text-gray-800 font-semibold py-2 rounded-lg hover:bg-gray-300 disabled:bg-gray-300"
            >
              Cancelar
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 mt-6">
            Seu pagamento é processado de forma segura. Você receberá o acesso
            imediatamente após a confirmação.
          </p>
        </div>
      </div>
    </main>
  );
}
