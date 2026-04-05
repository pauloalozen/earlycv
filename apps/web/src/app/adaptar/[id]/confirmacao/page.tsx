"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CvAdaptationDto } from "@/lib/cv-adaptation-api";
import { getCvAdaptation } from "@/lib/cv-adaptation-api";

export default function ConfirmacaoPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [adaptation, setAdaptation] = useState<CvAdaptationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdaptation = async () => {
      try {
        const data = await getCvAdaptation(params.id);
        setAdaptation(data);

        // If status is already delivered or being processed, redirect to resultado after 2 seconds
        if (data.status === "paid" || data.status === "delivered") {
          setTimeout(() => {
            router.push(`/adaptar/${params.id}/resultado`);
          }, 2000);
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
  }, [params.id, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p>Processando...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-4">
            {error}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/adaptar/${params.id}/resultado`)}
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
        <div className="bg-green-50 border border-green-200 p-8 rounded-lg text-center">
          <div className="mb-6">
            <svg
              aria-label="Check mark icon"
              className="w-16 h-16 text-green-600 mx-auto"
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
          </div>

          <h1 className="text-3xl font-bold mb-2 text-green-800">
            Pagamento Confirmado!
          </h1>
          <p className="text-gray-600 mb-6">
            Seu CV está sendo processado e em breve estará pronto para download.
          </p>

          {adaptation?.jobTitle && (
            <div className="bg-white p-4 rounded mb-6 border border-green-200">
              <p className="text-gray-600">
                <strong>Vaga:</strong> {adaptation.jobTitle}
              </p>
              {adaptation.companyName && (
                <p className="text-gray-600">
                  <strong>Empresa:</strong> {adaptation.companyName}
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-gray-500 mb-6">
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
