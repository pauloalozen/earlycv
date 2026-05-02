import type { SeoPageDefinition } from "../types";

export const curriculoGupyPage: SeoPageDefinition = {
  slug: "curriculo-gupy",
  path: "/curriculo-gupy",
  published: true,
  updatedAt: "2026-05-02",
  sitemap: {
    changeFrequency: "weekly",
    priority: 0.75,
  },
  pageType: "transactional",
  category: "plataformas",
  seo: {
    title: "Currículo para Gupy: como melhorar sua aderência à vaga | EarlyCV",
    description:
      "Veja como estruturar seu currículo, usar palavras-chave e evitar erros que podem prejudicar sua candidatura em plataformas como a Gupy.",
  },
  hero: {
    title: "Currículo para Gupy: como aumentar a aderência com a vaga",
    description:
      "Veja como estruturar seu currículo, usar palavras-chave e evitar erros que prejudicam a clareza da sua candidatura em plataformas de recrutamento.",
  },
  sections: [
    {
      heading: "Por que seu currículo pode não avançar",
      bullets: [
        "Alta concorrência",
        "Vaga com muitos candidatos",
        "Currículo genérico",
        "Baixa aderência textual",
        "Experiências pouco claras",
        "Falta de requisitos importantes",
      ],
    },
    {
      heading: "O que normalmente ajuda",
      bullets: [
        "Clareza",
        "Palavras-chave relevantes",
        "Experiências conectadas à vaga",
        "Resultados",
        "Estrutura simples",
        "Dados completos",
      ],
    },
    {
      heading: "Como adaptar currículo antes de se candidatar",
      bullets: [
        "Ler a vaga",
        "Mapear requisitos",
        "Revisar resumo",
        "Ajustar competências",
        "Destacar experiências relacionadas",
        "Evitar exageros",
      ],
    },
    {
      heading: "Erros comuns",
      bullets: [
        "Copiar a vaga inteira",
        "Colocar termos que não domina",
        "Usar currículo visual demais",
        "Enviar sempre o mesmo CV",
        "Deixar experiências vagas",
      ],
    },
    {
      heading: "Como o EarlyCV ajuda",
      bullets: [
        "Compara CV com a vaga antes da candidatura",
        "Mostra lacunas",
        "Sugere melhorias",
        "Ajuda a gerar uma versão adaptada",
      ],
      paragraphs: [
        "Plataformas como a Gupy podem usar informações estruturadas, dados preenchidos e aderência textual para apoiar recrutadores e empresas.",
      ],
    },
  ],
  faq: [
    {
      question: "A Gupy reprova currículo automaticamente?",
      answer:
        "Não existe uma regra única pública. Há diferentes critérios de triagem e avaliação.",
    },
    {
      question: "Existe currículo perfeito para Gupy?",
      answer:
        "Não. O melhor é um currículo claro e aderente à vaga específica.",
    },
    {
      question: "Devo fazer um currículo diferente para cada vaga?",
      answer: "Em geral sim, com adaptações por contexto e requisitos.",
    },
    {
      question: "Posso usar currículo em PDF?",
      answer: "Sim, desde que tenha estrutura simples e leitura clara.",
    },
    {
      question: "O que mais pesa em uma candidatura?",
      answer:
        "A combinação entre aderência técnica, clareza, contexto e evidência real de resultados.",
    },
  ],
  relatedLinks: [
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "Adaptar currículo para vaga",
    },
    { href: "/curriculo-ats", label: "Currículo ATS" },
    { href: "/blog/curriculo-ats", label: "Blog: currículo ATS" },
  ],
  cta: {
    title: "Descubra se seu currículo combina com a vaga",
    description:
      "Cole a descrição da vaga, envie seu currículo e receba uma análise gratuita de compatibilidade em poucos minutos.",
    buttonLabel: "Analisar meu currículo grátis",
    target: "/adaptar",
  },
};
