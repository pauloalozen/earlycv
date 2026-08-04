import { redirect } from "next/navigation";

type LegacySearchParams = Promise<Record<string, string | undefined>>;

// Rota descontinuada — o conteudo de Enriquecimento agora vive como guia
// dentro de /admin/ingestion (ver ../_components/enrichment-tab-content.tsx),
// sem precisar navegar pra uma rota separada. Mantido como redirect pra
// nao quebrar links/bookmarks antigos; traduz os nomes de query antigos
// (tab/page/status) pros novos (enrichTab/enrichPage/enrichStatus), que
// tiveram que ser renomeados pra nao colidir com os mesmos nomes usados
// pelas outras guias de /admin/ingestion.
export default async function LegacyEnrichmentFilterPage({
  searchParams,
}: {
  searchParams: LegacySearchParams;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "enrichment" });

  if (sp.tab === "discards" || sp.tab === "config") {
    params.set("enrichTab", sp.tab);
  }
  if (sp.page) params.set("enrichPage", sp.page);
  if (sp.status) params.set("enrichStatus", sp.status);
  if (sp.search) params.set("search", sp.search);
  if (sp.sourceId) params.set("sourceId", sp.sourceId);
  if (sp.discardReason) params.set("discardReason", sp.discardReason);
  if (sp.discardSourceId) params.set("discardSourceId", sp.discardSourceId);
  if (sp.discardTitle) params.set("discardTitle", sp.discardTitle);

  redirect(`/admin/ingestion?${params}`);
}
