import type { SeoPageDefinition } from "../types";

export const curriculoGupyPage: SeoPageDefinition = {
  slug: "curriculo-gupy",
  path: "/curriculo-gupy",
  published: true,
  updatedAt: "2026-05-02",
  pageType: "transactional",
  category: "plataformas",
  seo: {
    title: "Curriculo para Gupy: como melhorar sua aderencia a vaga | EarlyCV",
    description:
      "Veja como estruturar seu curriculo, usar palavras-chave e evitar erros que podem prejudicar sua candidatura em plataformas como a Gupy.",
  },
  hero: {
    title: "Curriculo para Gupy: como aumentar a aderencia com a vaga",
    description:
      "Veja como estruturar seu curriculo, usar palavras-chave e evitar erros que prejudicam a clareza da sua candidatura em plataformas de recrutamento.",
  },
  sections: [
    {
      heading: "Por que seu curriculo pode nao avancar",
      bullets: [
        "Alta concorrencia",
        "Vaga com muitos candidatos",
        "Curriculo generico",
        "Baixa aderencia textual",
        "Experiencias pouco claras",
        "Falta de requisitos importantes",
      ],
    },
    {
      heading: "O que normalmente ajuda",
      bullets: [
        "Clareza",
        "Palavras-chave relevantes",
        "Experiencias conectadas a vaga",
        "Resultados",
        "Estrutura simples",
        "Dados completos",
      ],
    },
    {
      heading: "Como adaptar curriculo antes de se candidatar",
      bullets: [
        "Ler a vaga",
        "Mapear requisitos",
        "Revisar resumo",
        "Ajustar competencias",
        "Destacar experiencias relacionadas",
        "Evitar exageros",
      ],
    },
    {
      heading: "Erros comuns",
      bullets: [
        "Copiar a vaga inteira",
        "Colocar termos que nao domina",
        "Usar curriculo visual demais",
        "Enviar sempre o mesmo CV",
        "Deixar experiencias vagas",
      ],
    },
    {
      heading: "Como o EarlyCV ajuda",
      bullets: [
        "Compara CV com a vaga antes da candidatura",
        "Mostra lacunas",
        "Sugere melhorias",
        "Ajuda a gerar uma versao adaptada",
      ],
      paragraphs: [
        "Plataformas como a Gupy podem usar informacoes estruturadas, dados preenchidos e aderencia textual para apoiar recrutadores e empresas.",
      ],
    },
  ],
  faq: [
    {
      question: "A Gupy reprova curriculo automaticamente?",
      answer:
        "Nao existe uma regra unica publica. Ha diferentes criterios de triagem e avaliacao.",
    },
    {
      question: "Existe curriculo perfeito para Gupy?",
      answer:
        "Nao. O melhor e um curriculo claro e aderente a vaga especifica.",
    },
    {
      question: "Devo fazer um curriculo diferente para cada vaga?",
      answer: "Em geral sim, com adaptacoes por contexto e requisitos.",
    },
    {
      question: "Posso usar curriculo em PDF?",
      answer: "Sim, desde que tenha estrutura simples e leitura clara.",
    },
    {
      question: "O que mais pesa em uma candidatura?",
      answer:
        "A combinacao entre aderencia tecnica, clareza, contexto e evidencia real de resultados.",
    },
  ],
  relatedLinks: [
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "Adaptar curriculo para vaga",
    },
    { href: "/curriculo-ats", label: "Curriculo ATS" },
    { href: "/blog/curriculo-ats", label: "Blog: curriculo ATS" },
  ],
  cta: {
    title: "Descubra se seu curriculo combina com a vaga",
    description:
      "Cole a descricao da vaga, envie seu curriculo e receba uma analise gratuita de compatibilidade em poucos minutos.",
    buttonLabel: "Analisar meu curriculo gratis",
    target: "/adaptar",
  },
};
