export const SEO_PAGE_SLUGS = [
  "curriculo-ats",
  "adaptar-curriculo-para-vaga",
  "curriculo-gupy",
  "modelo-curriculo-ats",
  "palavras-chave-curriculo",
] as const;

export type SeoPageSlug = (typeof SEO_PAGE_SLUGS)[number];

export type SeoPageSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  example?: {
    after: string;
    before: string;
    title?: string;
  };
};

export type SeoPageFaqItem = {
  answer: string;
  question: string;
};

export type SeoRelatedLink = {
  href: string;
  label: string;
};

export type SeoPageCta = {
  buttonLabel: string;
  description: string;
  target: string;
  title: string;
};

export type SeoPageType = "hub" | "profession" | "transactional";

export type SeoKeywordItem = {
  term: string;
  whenItMakesSense: string;
  whereToUse: string;
};

export type SeoKeywordRole = {
  keywords: SeoKeywordItem[];
  seniority?: "geral" | "junior" | "pleno" | "senior";
  title: string;
};

export type SeoKeywordGroup = {
  area: string;
  description: string;
  roles: SeoKeywordRole[];
};

export type SeoPageDefinition = {
  category: string;
  cta: SeoPageCta;
  faq?: SeoPageFaqItem[];
  hero: {
    description: string;
    title: string;
  };
  keywordGroups?: SeoKeywordGroup[];
  pageType: SeoPageType;
  alertMessage?: string;
  path: `/${SeoPageSlug}`;
  published: boolean;
  relatedLinks: SeoRelatedLink[];
  sections: SeoPageSection[];
  seo: {
    description: string;
    title: string;
  };
  slug: SeoPageSlug;
  updatedAt: string;
};
