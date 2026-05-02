import type { SeoPageDefinition } from "../types";

export const curriculoAtsPage: SeoPageDefinition = {
  slug: "curriculo-ats",
  path: "/curriculo-ats",
  published: true,
  updatedAt: "2026-05-02",
  category: "ats",
  seo: {
    title: "Curriculo ATS: como criar um curriculo compativel | EarlyCV",
    description:
      "Entenda como criar um curriculo compativel com ATS, evitar erros de formatacao e melhorar a aderencia do seu CV com cada vaga.",
  },
  hero: {
    title: "Curriculo ATS: crie um curriculo que sistemas conseguem ler",
    description:
      "Entenda como sistemas de triagem analisam curriculos e veja como melhorar a compatibilidade do seu CV com cada vaga.",
  },
  sections: [
    {
      heading: "O que e um curriculo ATS",
      paragraphs: [
        "ATS sao sistemas usados para organizar, filtrar ou apoiar processos seletivos.",
        "Nao existe uma regra unica para todas as plataformas, mas curriculos claros tendem a facilitar leitura e triagem.",
      ],
    },
    {
      heading: "Por que a formatacao importa",
      paragraphs: [
        "Layouts com muitas colunas, imagens, tabelas complexas e icones podem dificultar a leitura automatizada e humana.",
      ],
    },
    {
      heading: "O que melhora a leitura do curriculo",
      bullets: [
        "Estrutura simples",
        "Titulos claros",
        "Experiencias com cargo, empresa, periodo e resultados",
        "Competencias relevantes",
        "Palavras-chave compativeis com a vaga",
        "Arquivo em formato adequado",
      ],
    },
    {
      heading: "Erros comuns",
      bullets: [
        "Curriculo so em imagem",
        "Design complexo",
        "Palavras-chave soltas sem contexto",
        "Resumo generico",
        "Experiencias sem resultado",
        "Falta de aderencia a vaga",
      ],
    },
    {
      heading: "Como o EarlyCV ajuda",
      bullets: [
        "Compara curriculo com vaga",
        "Mostra score de compatibilidade",
        "Identifica lacunas",
        "Sugere melhorias",
        "Gera versao otimizada mediante liberacao",
      ],
    },
  ],
  faq: [
    {
      question: "O que significa ATS?",
      answer:
        "ATS e um sistema usado para apoiar triagem e organizacao de candidaturas.",
    },
    {
      question: "Curriculo em PDF passa em ATS?",
      answer: "Em geral sim, desde que o PDF seja legivel e bem estruturado.",
    },
    {
      question: "Curriculo feito no Canva pode prejudicar?",
      answer:
        "Pode, quando usa estrutura visual complexa que reduz clareza de leitura.",
    },
    {
      question: "Palavras-chave garantem aprovacao?",
      answer:
        "Nao. Elas ajudam contexto e aderencia, mas nao garantem resultado.",
    },
    {
      question: "Preciso adaptar o curriculo para cada vaga?",
      answer:
        "Em muitos casos sim, porque cada vaga prioriza requisitos diferentes.",
    },
  ],
  relatedLinks: [
    { href: "/modelo-curriculo-ats", label: "Modelo de curriculo ATS" },
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "Adaptar curriculo para vaga",
    },
    {
      href: "/blog/palavras-chave-curriculo",
      label: "Blog: palavras-chave no curriculo",
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
