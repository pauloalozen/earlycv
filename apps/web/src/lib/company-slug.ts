// Precisa gerar exatamente o mesmo slug que
// apps/api/src/jobs/public-job-view.ts#toCompanySlug (usado por
// /internal/jobs/by-company/:companySlug pra casar o slug da URL com
// Company.name) — sem pacote compartilhado entre api e web, mantidos em
// sincronia manualmente. Não alterar um sem o outro.
export function toCompanySlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
