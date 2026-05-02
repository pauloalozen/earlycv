import type { SeoPageDefinition } from "../types";

export const adaptarCurriculoParaVagaPage: SeoPageDefinition = {
  slug: "adaptar-curriculo-para-vaga",
  path: "/adaptar-curriculo-para-vaga",
  published: true,
  updatedAt: "2026-05-02",
  pageType: "transactional",
  category: "adaptacao",
  seo: {
    title: "Adaptar currículo para vaga: como melhorar sua aderência | EarlyCV",
    description:
      "Compare seu currículo com a descrição da vaga, encontre lacunas e gere uma versão mais alinhada ao que a empresa procura.",
  },
  hero: {
    title: "Adapte seu currículo para cada vaga sem inventar experiência",
    description:
      "Compare seu currículo com a descrição da vaga, identifique lacunas e gere uma versão mais alinhada ao que a empresa procura.",
  },
  sections: [
    {
      heading: "Por que adaptar o currículo para cada vaga",
      paragraphs: [
        "Vagas parecidas podem priorizar competências diferentes. Ajustar foco e linguagem melhora a aderência da candidatura.",
      ],
    },
    {
      heading: "O que deve mudar no currículo",
      bullets: [
        "Resumo profissional",
        "Ordem e destaque das experiências",
        "Competências",
        "Palavras-chave",
        "Projetos",
        "Resultados mais relevantes",
      ],
    },
    {
      heading: "O que não deve ser inventado",
      paragraphs: [
        "Adaptar não é mentir. O foco é reorganizar, detalhar e destacar experiências reais com rastreabilidade.",
      ],
    },
    {
      heading: "Como usar a descrição da vaga",
      bullets: [
        "Identificar responsabilidades",
        "Separar requisitos obrigatórios e desejáveis",
        "Observar ferramentas e metodologias",
        "Usar palavras-chave com contexto",
      ],
    },
    {
      heading: "Exemplo simples antes/depois",
      example: {
        before: "Responsável por relatórios e indicadores.",
        after:
          "Desenvolveu dashboards em Power BI para acompanhamento de indicadores comerciais, apoiando decisões de vendas e priorização de oportunidades.",
      },
    },
    {
      heading: "Como o EarlyCV ajuda",
      bullets: [
        "Analisa currículo + vaga",
        "Calcula compatibilidade",
        "Mostra palavras importantes",
        "Aponta lacunas",
        "Gera currículo adaptado",
      ],
    },
  ],
  faq: [
    {
      question: "Posso adaptar o mesmo currículo para várias vagas?",
      answer: "Sim. O ideal é criar variações alinhadas a cada vaga.",
    },
    {
      question: "Adaptar currículo é mentir?",
      answer:
        "Não. Adaptar é destacar fatos reais de forma relevante para a vaga.",
    },
    {
      question: "O que muda entre uma versão e outra?",
      answer:
        "Resumo, ênfase das experiências, competências e linguagem de aderência.",
    },
    {
      question: "Preciso mudar o currículo inteiro?",
      answer: "Nem sempre. Mudanças pontuais podem gerar melhor alinhamento.",
    },
    {
      question: "Como saber quais palavras-chave usar?",
      answer: "Use os termos da vaga com contexto real nas suas experiências.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "Currículo ATS" },
    { href: "/curriculo-gupy", label: "Currículo para Gupy" },
    {
      href: "/blog/como-adaptar-curriculo-para-vaga",
      label: "Blog: como adaptar currículo",
    },
    {
      href: "/palavras-chave-curriculo",
      label: "Hub: palavras-chave para currículo",
    },
  ],
  cta: {
    title: "Descubra se seu currículo combina com a vaga",
    description:
      "Cole a descrição da vaga, envie seu currículo e receba uma análise gratuita de compatibilidade em poucos minutos.",
    buttonLabel: "Analisar meu currículo grátis",
    target: "/adaptar",
  },
};
