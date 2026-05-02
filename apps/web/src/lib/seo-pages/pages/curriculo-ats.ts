import type { SeoPageDefinition } from "../types";

export const curriculoAtsPage: SeoPageDefinition = {
  slug: "curriculo-ats",
  path: "/curriculo-ats",
  published: true,
  updatedAt: "2026-05-02",
  pageType: "transactional",
  category: "ats",
  seo: {
    title: "Currículo ATS: como criar um currículo compatível | EarlyCV",
    description:
      "Entenda como criar um currículo compatível com ATS, evitar erros de formatação e melhorar a aderência do seu CV com cada vaga.",
  },
  hero: {
    title: "Currículo ATS: crie um currículo que sistemas conseguem ler",
    description:
      "Entenda como sistemas de triagem analisam currículos e veja como melhorar a compatibilidade do seu CV com cada vaga.",
  },
  sections: [
    {
      heading: "O que é um currículo ATS",
      paragraphs: [
        "ATS são sistemas usados para organizar, filtrar ou apoiar processos seletivos.",
        "Não existe uma regra única para todas as plataformas, mas currículos claros tendem a facilitar leitura e triagem.",
      ],
    },
    {
      heading: "Por que a formatação importa",
      paragraphs: [
        "Layouts com muitas colunas, imagens, tabelas complexas e ícones podem dificultar a leitura automatizada e humana.",
      ],
    },
    {
      heading: "O que melhora a leitura do currículo",
      bullets: [
        "Estrutura simples",
        "Títulos claros",
        "Experiências com cargo, empresa, período e resultados",
        "Competências relevantes",
        "Palavras-chave compatíveis com a vaga",
        "Arquivo em formato adequado",
      ],
    },
    {
      heading: "Erros comuns",
      bullets: [
        "Currículo só em imagem",
        "Design complexo",
        "Palavras-chave soltas sem contexto",
        "Resumo genérico",
        "Experiências sem resultado",
        "Falta de aderência à vaga",
      ],
    },
    {
      heading: "Como o EarlyCV ajuda",
      bullets: [
        "Compara currículo com vaga",
        "Mostra score de compatibilidade",
        "Identifica lacunas",
        "Sugere melhorias",
        "Gera versão otimizada mediante liberação",
      ],
    },
  ],
  faq: [
    {
      question: "O que significa ATS?",
      answer:
        "ATS é um sistema usado para apoiar triagem e organização de candidaturas.",
    },
    {
      question: "Currículo em PDF passa em ATS?",
      answer: "Em geral sim, desde que o PDF seja legível e bem estruturado.",
    },
    {
      question: "Currículo feito no Canva pode prejudicar?",
      answer:
        "Pode, quando usa estrutura visual complexa que reduz clareza de leitura.",
    },
    {
      question: "Palavras-chave garantem aprovação?",
      answer:
        "Não. Elas ajudam contexto e aderência, mas não garantem resultado.",
    },
    {
      question: "Preciso adaptar o currículo para cada vaga?",
      answer:
        "Em muitos casos sim, porque cada vaga prioriza requisitos diferentes.",
    },
  ],
  relatedLinks: [
    { href: "/modelo-curriculo-ats", label: "Modelo de currículo ATS" },
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "Adaptar currículo para vaga",
    },
    {
      href: "/blog/palavras-chave-curriculo",
      label: "Blog: palavras-chave no currículo",
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
