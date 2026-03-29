export type Job = {
  company: string;
  datePosted: string;
  description: string;
  employmentType: "CONTRACTOR" | "FULL_TIME" | "PART_TIME";
  fitScore: number;
  keywords: string[];
  location: string;
  remoteType: string;
  salary: string;
  slug: string;
  summary: string;
  timeLabel: string;
  title: string;
};

export const jobs: Job[] = [
  {
    slug: "gerente-de-dados-natura",
    company: "Natura",
    title: "Vaga de Gerente de Dados",
    summary:
      "Lideranca de dados para acelerar inteligencia comercial, analytics e governanca com times multidisciplinares.",
    description:
      "A Natura busca uma pessoa para liderar estrategia de dados, analytics e governanca em iniciativas de crescimento. A vaga exige experiencia com times de dados, traducao de necessidades de negocio e priorizacao de roadmaps analiticos. A pessoa atuara com stakeholders executivos, produtos orientados a dados e melhoria continua de processos de decisao.",
    location: "Sao Paulo, Brasil",
    remoteType: "Hibrido",
    employmentType: "FULL_TIME",
    salary: "R$ 18 mil a R$ 24 mil",
    fitScore: 91,
    timeLabel: "2h antes",
    datePosted: "2026-03-29",
    keywords: [
      "vaga de gerente de dados",
      "gerente de dados",
      "analytics",
      "governanca de dados",
      "vaga natura",
    ],
  },
  {
    slug: "programador-nestle",
    company: "Nestle",
    title: "Vaga de Programador",
    summary:
      "Desenvolvimento de aplicacoes internas com foco em integracoes, performance e manutencao de sistemas de negocio.",
    description:
      "A Nestle procura uma pessoa programadora para evoluir sistemas internos ligados a operacoes, integracoes e automacoes. A posicao envolve implementacao de novas funcionalidades, correcao de bugs, colaboracao com produto e garantia de qualidade de codigo. Experiencia com desenvolvimento web, APIs e boas praticas de engenharia e essencial.",
    location: "Sao Paulo, Brasil",
    remoteType: "Hibrido",
    employmentType: "FULL_TIME",
    salary: "R$ 9 mil a R$ 14 mil",
    fitScore: 87,
    timeLabel: "3h antes",
    datePosted: "2026-03-29",
    keywords: [
      "vaga de programador",
      "programador nestle",
      "desenvolvedor web",
      "vaga de desenvolvimento",
      "engenharia de software",
    ],
  },
  {
    slug: "product-analyst-ambev",
    company: "Ambev",
    title: "Vaga de Product Analyst",
    summary:
      "Analise de produto, experimentacao e acompanhamento de metricas para evolucao de experiencias digitais.",
    description:
      "A Ambev busca uma pessoa analista de produto para apoiar discovery, definicao de metricas e leitura de experimentos em produtos digitais. A vaga pede repertorio em analytics, colaboracao com tecnologia e negocio e capacidade de transformar dados em recomendacoes acionaveis para o roadmap.",
    location: "Sao Paulo, Brasil",
    remoteType: "Remoto e hibrido",
    employmentType: "FULL_TIME",
    salary: "R$ 8 mil a R$ 12 mil",
    fitScore: 89,
    timeLabel: "agora",
    datePosted: "2026-03-29",
    keywords: [
      "product analyst",
      "vaga de product analyst",
      "analista de produto",
      "vaga ambev",
      "experimentacao de produto",
    ],
  },
];

export function getJobBySlug(slug: string) {
  return jobs.find((job) => job.slug === slug);
}
