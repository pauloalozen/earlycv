import { companyDisplayName } from "@earlycv/config/job-display";

// Nome de empresa para exibição. A API já manda resolvido
// (Company.displayName ou o calculado); o cálculo local só cobre resposta
// de API anterior ao campo. Sem dependências: usado também em client
// components.

export function companyCountDisplayName(company: {
  name: string;
  displayName?: string;
}): string {
  return company.displayName?.trim() || companyDisplayName(company.name);
}

export function jobCompanyDisplayName(job: {
  company: string;
  companyDisplayName?: string | null;
}): string {
  return job.companyDisplayName?.trim() || companyDisplayName(job.company);
}
