import { adaptarCurriculoParaVagaPage } from "./pages/adaptar-curriculo-para-vaga";
import { curriculoAtsPage } from "./pages/curriculo-ats";
import { curriculoGupyPage } from "./pages/curriculo-gupy";
import { curriculoPorVagaPage } from "./pages/curriculo-por-vaga";
import { modeloCurriculoAtsPage } from "./pages/modelo-curriculo-ats";
import { palavrasChaveCurriculoHubPage } from "./pages/palavras-chave-curriculo";
import { prepararCurriculoPage } from "./pages/preparar-curriculo";
import type { SeoPageDefinition, SeoPageSlug } from "./types";

const SEO_PAGES: SeoPageDefinition[] = [
  curriculoAtsPage,
  adaptarCurriculoParaVagaPage,
  curriculoGupyPage,
  modeloCurriculoAtsPage,
  palavrasChaveCurriculoHubPage,
  prepararCurriculoPage,
  curriculoPorVagaPage,
];

const SEO_PAGES_BY_SLUG = new Map<SeoPageSlug, SeoPageDefinition>(
  SEO_PAGES.map((page) => [page.slug, page]),
);

export function getAllSeoPages() {
  return SEO_PAGES;
}

export function getPublishedSeoPages() {
  return SEO_PAGES.filter((page) => page.published);
}

export function isSeoPageSlug(value: string): value is SeoPageSlug {
  return SEO_PAGES_BY_SLUG.has(value as SeoPageSlug);
}

export function getSeoPageBySlug(slug: string) {
  if (!isSeoPageSlug(slug)) {
    return null;
  }

  return SEO_PAGES_BY_SLUG.get(slug) ?? null;
}

export function getSeoSitemapEntries() {
  return getPublishedSeoPages().map((page) => ({
    changeFrequency: page.sitemap.changeFrequency,
    lastModified: new Date(page.updatedAt),
    path: page.path,
    priority: page.sitemap.priority,
  }));
}
