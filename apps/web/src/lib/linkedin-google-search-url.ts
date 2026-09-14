// Monta a URL de busca do Google usada pelo botão "Pesquisar no LinkedIn" da
// curadoria de vagas (/admin/curadoria-vagas). Puramente client-side: não há
// integração com Google Search API nem scraping — só abre uma aba com a
// query pronta, o admin lê os resultados manualmente.
export function buildLinkedinGoogleSearchUrl(
  jobTitle: string,
  companyName: string,
): string {
  const query = `site:linkedin.com/jobs/view "${jobTitle}" "${companyName}"`;
  const params = new URLSearchParams({ q: query });
  return `https://www.google.com/search?${params.toString()}`;
}
