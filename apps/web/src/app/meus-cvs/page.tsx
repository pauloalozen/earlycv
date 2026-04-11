"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CvAdaptationDto } from "@/lib/cv-adaptation-api";
import { deleteCvAdaptation, listCvAdaptations } from "@/lib/cv-adaptation-api";

type FilterStatus =
  | "all"
  | "analyzing"
  | "awaiting_payment"
  | "paid"
  | "delivered"
  | "failed";

export default function MeusCvsPage() {
  const router = useRouter();
  const [adaptations, setAdaptations] = useState<CvAdaptationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);

  const limit = 10;

  useEffect(() => {
    const fetchAdaptations = async () => {
      setLoading(true);
      try {
        const data = await listCvAdaptations(page, limit);
        setAdaptations(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load adaptations",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAdaptations();
  }, [page]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta adaptação?")) {
      return;
    }

    setDeleting(id);
    try {
      await deleteCvAdaptation(id);
      setAdaptations(adaptations.filter((a) => a.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete adaptation",
      );
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (id: string, format: "pdf" | "docx") => {
    window.open(`/api/cv-adaptation/${id}/download?format=${format}`, "_blank");
  };

  const filtered =
    filterStatus === "all"
      ? adaptations
      : adaptations.filter((a) => a.status === filterStatus);

  const statusColors: Record<string, string> = {
    analyzing: "bg-blue-100 text-blue-800",
    awaiting_payment: "bg-yellow-100 text-yellow-800",
    paid: "bg-purple-100 text-purple-800",
    delivered: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  const statusLabels: Record<string, string> = {
    analyzing: "Analisando",
    awaiting_payment: "Aguardando pagamento",
    paid: "Gerando PDF",
    delivered: "Entregue",
    failed: "Erro",
  };

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Meus CVs Adaptados</h1>
          <button
            type="button"
            onClick={() => router.push("/adaptar")}
            className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-600"
          >
            + Novo CV
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-6">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-sm underline"
            >
              Descartar
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {(
            [
              "all",
              "analyzing",
              "awaiting_payment",
              "delivered",
              "failed",
            ] as FilterStatus[]
          ).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setFilterStatus(status);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filterStatus === status
                  ? "bg-orange-500 text-white"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
            >
              {status === "all"
                ? `Todos (${total})`
                : `${statusLabels[status]} (${adaptations.filter((a) => a.status === status).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex min-h-[calc(100dvh-220px)] flex-col items-center justify-center text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p>Carregando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600 mb-4">
              {total === 0
                ? "Você ainda não adaptou nenhum CV"
                : "Nenhum CV encontrado com este filtro"}
            </p>
            <button
              type="button"
              onClick={() => router.push("/adaptar")}
              className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-600"
            >
              Adaptar meu primeiro CV
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((adaptation) => (
              <div
                key={adaptation.id}
                className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {adaptation.jobTitle || "Adaptação sem título"}
                    </h3>
                    {adaptation.companyName && (
                      <p className="text-gray-600">
                        Empresa: {adaptation.companyName}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(adaptation.createdAt).toLocaleDateString(
                        "pt-BR",
                      )}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[adaptation.status] || "bg-gray-100"}`}
                  >
                    {statusLabels[adaptation.status] || adaptation.status}
                  </span>
                </div>

                {adaptation.template && (
                  <p className="text-sm text-gray-600 mb-4">
                    Template: <strong>{adaptation.template.name}</strong>
                  </p>
                )}

                <div className="flex gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/adaptar/${adaptation.id}/resultado`)
                    }
                    className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600"
                  >
                    Ver Resultado
                  </button>

                  {adaptation.status === "delivered" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownload(adaptation.id, "pdf")}
                        className="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700"
                      >
                        Baixar PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(adaptation.id, "docx")}
                        className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700"
                      >
                        Baixar DOCX
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(adaptation.id)}
                    disabled={deleting === adaptation.id}
                    className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 disabled:bg-gray-400"
                  >
                    {deleting === adaptation.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
            >
              Anterior
            </button>
            <span className="py-2 px-4">
              Página {page} de {Math.ceil(total / limit)}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(Math.ceil(total / limit), p + 1))
              }
              disabled={page >= Math.ceil(total / limit)}
              className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
