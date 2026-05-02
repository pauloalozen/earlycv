import type { SeoPageDefinition } from "../types";

export const modeloCurriculoAtsPage: SeoPageDefinition = {
  slug: "modelo-curriculo-ats",
  path: "/modelo-curriculo-ats",
  published: true,
  updatedAt: "2026-05-02",
  category: "modelo",
  seo: {
    title: "Modelo de curriculo ATS simples e facil de ler | EarlyCV",
    description:
      "Veja uma estrutura simples de curriculo ATS, com secoes claras para resumo, experiencia, competencias, formacao e projetos.",
  },
  hero: {
    title: "Modelo de curriculo ATS simples, limpo e facil de ler",
    description:
      "Veja uma estrutura recomendada para criar um curriculo objetivo, compativel com triagens automatizadas e facil para recrutadores analisarem.",
  },
  sections: [
    {
      heading: "Estrutura recomendada",
      bullets: [
        "Dados de contato",
        "Resumo profissional",
        "Experiencias",
        "Competencias",
        "Formacao",
        "Certificacoes",
        "Projetos, se fizer sentido",
      ],
    },
    {
      heading: "Cabecalho",
      paragraphs: [
        "Inclua nome, cidade/estado, telefone, e-mail e links profissionais relevantes. Evite excesso de informacoes pessoais.",
      ],
    },
    {
      heading: "Resumo profissional",
      paragraphs: [
        "Exemplo: Analista de dados com experiencia em BI, SQL e dashboards para suporte a decisoes comerciais.",
      ],
    },
    {
      heading: "Experiencia profissional",
      paragraphs: ["Estrutura sugerida: Cargo | Empresa | Periodo."],
      bullets: ["Bullets com acao + contexto + resultado"],
    },
    {
      heading: "Competencias",
      bullets: [
        "Tecnicas",
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
        "Excesso de icones",
        "Graficos",
        "Tabelas complexas",
        "Colunas dificeis de ler",
        "Informacoes pessoais desnecessarias",
      ],
    },
    {
      heading: "Exemplo de modelo em texto",
      paragraphs: [
        "Nome Completo | Cidade - UF | email@dominio.com | (11) 90000-0000",
        "Resumo: Profissional de produto com foco em analytics e melhoria de conversao.",
        "Experiencia: Product Analyst | Empresa X | 2022-atual. Implementou analises em funil e apoiou priorizacao com ganho de eficiencia no time.",
        "Competencias: SQL, Power BI, Excel, Analise de funil, Experimentacao.",
      ],
    },
    {
      heading: "Como adaptar o modelo a vaga",
      paragraphs: [
        "Use a descricao da vaga para ajustar palavras-chave, enfase das experiencias e competencias em cada candidatura.",
      ],
    },
  ],
  faq: [
    {
      question: "Qual melhor formato para curriculo ATS?",
      answer:
        "Em geral, formato simples, com secoes claras e leitura objetiva.",
    },
    {
      question: "Curriculo ATS precisa ser feio?",
      answer: "Nao. Ele precisa ser claro e facil de ler.",
    },
    {
      question: "Posso usar duas colunas?",
      answer:
        "Pode, mas estruturas simples costumam reduzir risco de leitura ruim.",
    },
    {
      question: "Devo colocar foto?",
      answer: "Depende do contexto. Em muitos casos nao e necessario.",
    },
    {
      question: "Posso baixar um modelo pronto?",
      answer:
        "Pode usar modelos como base, mas sempre adapte ao seu historico e a vaga.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "Curriculo ATS" },
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
