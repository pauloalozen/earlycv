"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CvAdaptationDto } from "@/lib/cv-adaptation-api";
import { getCvAdaptation } from "@/lib/cv-adaptation-api";

export default function ResultadoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [adaptation, setAdaptation] = useState<CvAdaptationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdaptation = async () => {
      try {
        const data = await getCvAdaptation(params.id);
        setAdaptation(data);

        // Continue polling while processing
        if (data.status === "analyzing" || data.status === "paid") {
          setTimeout(fetchAdaptation, 3000);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load adaptation",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAdaptation();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="max-w-2xl mx-auto">
        {adaptation.status === "analyzing" && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-lg">Estamos avaliando seu CV...</p>
            <p className="text-gray-600">Isso pode levar alguns segundos</p>
          </div>
        )}

        {adaptation.status === "awaiting_payment" && (
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">CV Adaptado Pronto!</h2>

            {adaptation.jobTitle && (
              <div className="mb-4">
                <p className="text-gray-600">
                  <strong>Vaga:</strong> {adaptation.jobTitle}
                </p>
              </div>
            )}

            <div className="bg-white p-4 rounded mb-4 border border-blue-200">
              <p className="text-gray-800">{adaptation.previewText}</p>
              <p className="text-gray-500 text-sm mt-2">
                (Preview - conteúdo completo após pagamento)
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/adaptar/${adaptation.id}/checkout`)}
              className="w-full bg-orange-500 text-white font-semibold py-3 rounded-lg hover:bg-orange-600"
            >
              Desbloquear resultado completo - R$ 19,00
            </button>
          </div>
        )}

        {adaptation.status === "paid" && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-lg">Gerando PDF...</p>
          </div>
        )}

        {adaptation.status === "delivered" && (
          <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-green-800">
              ✓ Seu CV está pronto!
            </h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <a
                  href={`/api/cv-adaptation/${adaptation.id}/download?format=pdf`}
                  className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 text-center"
                >
                  Baixar PDF
                </a>
                <a
                  href={`/api/cv-adaptation/${adaptation.id}/download?format=docx`}
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 text-center"
                >
                  Baixar DOCX
                </a>
              </div>
              <button
                type="button"
                onClick={() => router.push("/meus-cvs")}
                className="w-full bg-gray-200 text-gray-800 font-semibold py-3 rounded-lg hover:bg-gray-300"
              >
                Ver Histórico
              </button>
              <button
                type="button"
                onClick={() => router.push("/adaptar")}
                className="w-full bg-orange-500 text-white font-semibold py-3 rounded-lg hover:bg-orange-600"
              >
                Adaptar Outro CV
              </button>
            </div>
          </div>
        )}

        {adaptation.status === "failed" && (
          <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-red-800">Erro</h2>
            <p className="text-red-700 mb-4">
              Desculpe, ocorreu um erro ao processar seu CV. Por favor, tente
              novamente.
            </p>
            <button
              type="button"
              onClick={() => router.push("/adaptar")}
              className="w-full bg-orange-500 text-white font-semibold py-3 rounded-lg hover:bg-orange-600"
            >
              Tentar Novamente
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
