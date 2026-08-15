import type { JobSourceType } from "@prisma/client";

import { fetchAshbyCompanyLogo } from "./ashby-logo.extractor";
import { fetchGreenhouseCompanyLogo } from "./greenhouse-logo.extractor";
import { fetchGupyCompanyLogo } from "./gupy-logo.extractor";
import { fetchInHireCompanyLogo } from "./inhire-logo.extractor";
import { fetchLeverCompanyLogo } from "./lever-logo.extractor";
import { fetchTeamtailorCompanyLogo } from "./teamtailor-logo.extractor";
import { fetchWorkdayCompanyLogo } from "./workday-logo.extractor";

export type LogoExtractor = (sourceUrl: string) => Promise<string | null>;

// Registro central de quais adapters ja sabem extrair logo da fonte
// original. Adicionar um novo adapter aqui e o unico passo necessario pra
// ele aparecer nas opcoes de "carregar logo" (por empresa e no escopo do
// job de LOGO_FETCH). Ver tambem IMAGE_HOSTS_REQUIRING_BROWSER_UA em
// company-logo-fetch.service.ts se o CDN da imagem bloquear UA de bot.
//
// greenhouse e ashby: cobertura parcial e conhecida (~23% e ~65% das
// fontes atuais, respectivamente) — ver comentario no topo de cada
// extractor. lever, workday e teamtailor: cobertura alta, padrao bem
// consistente. talentbrew (site 100% sob medida por cliente, sem template
// compartilhado) ficou de fora — sem padrao generico confiavel.
export const LOGO_EXTRACTORS: Partial<Record<JobSourceType, LogoExtractor>> = {
  gupy: fetchGupyCompanyLogo,
  inhire: fetchInHireCompanyLogo,
  greenhouse: fetchGreenhouseCompanyLogo,
  lever: fetchLeverCompanyLogo,
  ashby: fetchAshbyCompanyLogo,
  workday: fetchWorkdayCompanyLogo,
  teamtailor: fetchTeamtailorCompanyLogo,
};

export const LOGO_FETCH_SUPPORTED_ADAPTERS = Object.keys(
  LOGO_EXTRACTORS,
) as JobSourceType[];
