import type { SeoPageDefinition } from "../types";

export const adaptarCurriculoParaVagaPage: SeoPageDefinition = {
  slug: "adaptar-curriculo-para-vaga",
  path: "/adaptar-curriculo-para-vaga",
  published: true,
  updatedAt: "2026-05-02",
  pageType: "transactional",
  category: "adaptacao",
  seo: {
    title: "Adaptar curriculo para vaga: como melhorar sua aderencia | EarlyCV",
    description:
      "Compare seu curriculo com a descricao da vaga, encontre lacunas e gere uma versao mais alinhada ao que a empresa procura.",
  },
  hero: {
    title: "Adapte seu curriculo para cada vaga sem inventar experiencia",
    description:
      "Compare seu curriculo com a descricao da vaga, identifique lacunas e gere uma versao mais alinhada ao que a empresa procura.",
  },
  sections: [
    {
      heading: "Por que adaptar o curriculo para cada vaga",
      paragraphs: [
        "Vagas parecidas podem priorizar competencias diferentes. Ajustar foco e linguagem melhora a aderencia da candidatura.",
      ],
    },
    {
      heading: "O que deve mudar no curriculo",
      bullets: [
        "Resumo profissional",
        "Ordem e destaque das experiencias",
        "Competencias",
        "Palavras-chave",
        "Projetos",
        "Resultados mais relevantes",
      ],
    },
    {
      heading: "O que nao deve ser inventado",
      paragraphs: [
        "Adaptar nao e mentir. O foco e reorganizar, detalhar e destacar experiencias reais com rastreabilidade.",
      ],
    },
    {
      heading: "Como usar a descricao da vaga",
      bullets: [
        "Identificar responsabilidades",
        "Separar requisitos obrigatorios e desejaveis",
        "Observar ferramentas e metodologias",
        "Usar palavras-chave com contexto",
      ],
    },
    {
      heading: "Exemplo simples antes/depois",
      example: {
        before: "Responsavel por relatorios e indicadores.",
        after:
          "Desenvolveu dashboards em Power BI para acompanhamento de indicadores comerciais, apoiando decisoes de vendas e priorizacao de oportunidades.",
      },
    },
    {
      heading: "Como o EarlyCV ajuda",
      bullets: [
        "Analisa curriculo + vaga",
        "Calcula compatibilidade",
        "Mostra palavras importantes",
        "Aponta lacunas",
        "Gera curriculo adaptado",
      ],
    },
  ],
  faq: [
    {
      question: "Posso adaptar o mesmo curriculo para varias vagas?",
      answer: "Sim. O ideal e criar variacoes alinhadas a cada vaga.",
    },
    {
      question: "Adaptar curriculo e mentir?",
      answer:
        "Nao. Adaptar e destacar fatos reais de forma relevante para a vaga.",
    },
    {
      question: "O que muda entre uma versao e outra?",
      answer:
        "Resumo, enfase das experiencias, competencias e linguagem de aderencia.",
    },
    {
      question: "Preciso mudar o curriculo inteiro?",
      answer: "Nem sempre. Mudancas pontuais podem gerar melhor alinhamento.",
    },
    {
      question: "Como saber quais palavras-chave usar?",
      answer: "Use os termos da vaga com contexto real nas suas experiencias.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "Curriculo ATS" },
    { href: "/curriculo-gupy", label: "Curriculo para Gupy" },
    {
      href: "/blog/como-adaptar-curriculo-para-vaga",
      label: "Blog: como adaptar curriculo",
    },
    {
      href: "/palavras-chave-curriculo",
      label: "Hub: palavras-chave para curriculo",
    },
  ],
  cta: {
    title: "Descubra se seu curriculo combina com a vaga",
    description:
      "Cole a descricao da vaga, envie seu curriculo e receba uma analise gratuita de compatibilidade em poucos minutos.",
    buttonLabel: "Analisar meu curriculo gratis",
    target: "/adaptar",
  },
};
