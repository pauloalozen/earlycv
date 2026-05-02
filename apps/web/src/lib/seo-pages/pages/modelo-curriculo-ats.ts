import type { SeoPageDefinition } from "../types";

export const modeloCurriculoAtsPage: SeoPageDefinition = {
  slug: "modelo-curriculo-ats",
  path: "/modelo-curriculo-ats",
  published: true,
  updatedAt: "2026-05-02",
  pageType: "transactional",
  category: "modelo",
  seo: {
    title: "Modelo de currículo ATS simples e fácil de ler | EarlyCV",
    description:
      "Veja uma estrutura simples de currículo ATS, com seções claras para resumo, experiência, competências, formação e projetos.",
  },
  hero: {
    title: "Modelo de currículo ATS simples, limpo e fácil de ler",
    description:
      "Veja uma estrutura recomendada para criar um currículo objetivo, compatível com triagens automatizadas e fácil para recrutadores analisarem.",
  },
  sections: [
    {
      heading: "Estrutura recomendada",
      bullets: [
        "Dados de contato",
        "Resumo profissional",
        "Experiências",
        "Competências",
        "Formação",
        "Certificações",
        "Projetos, se fizer sentido",
      ],
    },
    {
      heading: "Cabeçalho",
      paragraphs: [
        "Inclua nome, cidade/estado, telefone, e-mail e links profissionais relevantes. Evite excesso de informações pessoais.",
      ],
    },
    {
      heading: "Resumo profissional",
      paragraphs: [
        "Exemplo: Analista de dados com experiência em BI, SQL e dashboards para suporte a decisões comerciais.",
      ],
    },
    {
      heading: "Experiência profissional",
      paragraphs: ["Estrutura sugerida: Cargo | Empresa | Período."],
      bullets: ["Bullets com ação + contexto + resultado"],
    },
    {
      heading: "Competências",
      bullets: [
        "Técnicas",
        "Ferramentas",
        "Metodologias",
        "Idiomas",
        "Comportamentais, se relevantes",
      ],
    },
    {
      heading: "O que evitar",
      bullets: [
        "Foto, salvo quando fizer sentido",
        "Excesso de ícones",
        "Gráficos",
        "Tabelas complexas",
        "Colunas difíceis de ler",
        "Informações pessoais desnecessárias",
      ],
    },
    {
      heading: "Exemplo de modelo em texto",
      paragraphs: [
        "Nome Completo | Cidade - UF | email@dominio.com | (11) 90000-0000",
        "Resumo: Profissional de produto com foco em analytics e melhoria de conversão.",
        "Experiência: Product Analyst | Empresa X | 2022-atual. Implementou análises em funil e apoiou priorização com ganho de eficiência no time.",
        "Competências: SQL, Power BI, Excel, Análise de funil, Experimentação.",
      ],
    },
    {
      heading: "Como adaptar o modelo à vaga",
      paragraphs: [
        "Use a descrição da vaga para ajustar palavras-chave, ênfase das experiências e competências em cada candidatura.",
      ],
    },
  ],
  faq: [
    {
      question: "Qual melhor formato para currículo ATS?",
      answer:
        "Em geral, formato simples, com seções claras e leitura objetiva.",
    },
    {
      question: "Currículo ATS precisa ser feio?",
      answer: "Não. Ele precisa ser claro e fácil de ler.",
    },
    {
      question: "Posso usar duas colunas?",
      answer:
        "Pode, mas estruturas simples costumam reduzir risco de leitura ruim.",
    },
    {
      question: "Devo colocar foto?",
      answer: "Depende do contexto. Em muitos casos não é necessário.",
    },
    {
      question: "Posso baixar um modelo pronto?",
      answer:
        "Pode usar modelos como base, mas sempre adapte ao seu histórico e à vaga.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "Currículo ATS" },
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
