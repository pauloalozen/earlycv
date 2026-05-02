import type { SeoKeywordRole, SeoPageDefinition } from "../types";

const BASE_KEYWORDS: SeoKeywordRole["keywords"] = [
  {
    term: "Planejamento",
    whereToUse: "Resumo / Experiência",
    whenItMakesSense: "Quando você definiu prioridades, escopo ou cronogramas.",
  },
  {
    term: "Execução",
    whereToUse: "Experiência",
    whenItMakesSense: "Quando você conduziu entregas de ponta a ponta.",
  },
  {
    term: "Indicadores",
    whereToUse: "Experiência / Resultados",
    whenItMakesSense: "Quando você acompanhou metas e mediu performance.",
  },
  {
    term: "Melhoria contínua",
    whereToUse: "Experiência / Projetos",
    whenItMakesSense: "Quando você revisou processos e reduziu gargalos.",
  },
  {
    term: "Comunicação",
    whereToUse: "Resumo / Competências",
    whenItMakesSense: "Quando atuou com times e stakeholders diferentes.",
  },
  {
    term: "Colaboração",
    whereToUse: "Experiência",
    whenItMakesSense: "Quando trabalhou com equipes multidisciplinares.",
  },
  {
    term: "Priorização",
    whereToUse: "Experiência / Competências",
    whenItMakesSense: "Quando precisou decidir entre demandas concorrentes.",
  },
  {
    term: "Qualidade",
    whereToUse: "Experiência / Projetos",
    whenItMakesSense:
      "Quando definiu critérios, revisões ou controles de qualidade.",
  },
];

function role(
  title: string,
  extra: SeoKeywordRole["keywords"],
): SeoKeywordRole {
  return {
    title,
    seniority: "geral",
    keywords: [...extra, ...BASE_KEYWORDS],
  };
}

export const palavrasChaveCurriculoHubPage: SeoPageDefinition = {
  slug: "palavras-chave-curriculo",
  path: "/palavras-chave-curriculo",
  published: true,
  pageType: "hub",
  updatedAt: "2026-05-02",
  category: "palavras-chave",
  seo: {
    title: "Palavras-chave para currículo: lista por área e cargo | EarlyCV",
    description:
      "Veja exemplos de palavras-chave para currículo por área, cargo e senioridade. Aprenda como usar termos da vaga sem exagerar e compare seu CV com a vaga no EarlyCV.",
  },
  hero: {
    title: "Palavras-chave para currículo: lista por área, cargo e senioridade",
    description:
      "Veja exemplos de termos que aparecem em vagas e entenda como usar palavras-chave no currículo sem exagerar ou inventar experiência.",
  },
  alertMessage:
    "Não copie palavras-chave aleatórias. O ideal é usar apenas termos que façam sentido para sua experiência e para a vaga desejada.",
  sections: [
    {
      heading: "O que são palavras-chave no currículo",
      paragraphs: [
        "São termos que descrevem competências, ferramentas, responsabilidades e contextos comuns nas vagas da sua área.",
      ],
    },
    {
      heading: "Como usar palavras-chave sem exagerar",
      bullets: [
        "Use contexto real nas experiências",
        "Não inclua termos que você não domina",
        "Adapte para cada vaga",
        "Evite listas soltas sem evidência",
      ],
    },
    {
      heading: "Onde colocar palavras-chave",
      bullets: [
        "Resumo profissional",
        "Experiência",
        "Competências",
        "Projetos",
        "Certificações",
        "Formação",
      ],
    },
    {
      heading: "Erros comuns",
      bullets: [
        "Copiar a descrição da vaga inteira",
        "Colocar ferramentas que não domina",
        "Repetir palavra-chave sem contexto",
        "Criar seção de competências gigante",
        "Ignorar experiências reais mais relevantes",
        "Usar o mesmo currículo para todas as vagas",
      ],
    },
  ],
  keywordGroups: [
    {
      area: "Tecnologia",
      description:
        "Termos comuns para desenvolvimento e arquitetura de software.",
      roles: [
        role("Desenvolvedor Backend", [
          {
            term: "APIs REST",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando desenvolveu ou integrou APIs.",
          },
          {
            term: "Node.js",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando construiu serviços backend com Node.",
          },
        ]),
        role("Desenvolvedor Frontend", [
          {
            term: "React",
            whereToUse: "Experiência / Projetos",
            whenItMakesSense: "Quando desenvolveu interfaces com React.",
          },
          {
            term: "TypeScript",
            whereToUse: "Competências",
            whenItMakesSense: "Quando tipou código e melhorou manutenção.",
          },
        ]),
      ],
    },
    {
      area: "Dados e BI",
      description: "Termos para análise, modelagem e visualização de dados.",
      roles: [
        role("Analista de Dados", [
          {
            term: "SQL",
            whereToUse: "Competências / Experiência",
            whenItMakesSense: "Quando extraiu e analisou dados.",
          },
          {
            term: "Power BI",
            whereToUse: "Experiência / Projetos",
            whenItMakesSense: "Quando montou dashboards e relatórios.",
          },
        ]),
        role("Analista de BI", [
          {
            term: "Modelagem dimensional",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando estruturou fatos e dimensões.",
          },
          {
            term: "ETL",
            whereToUse: "Experiência / Competências",
            whenItMakesSense:
              "Quando automatizou carga e transformação de dados.",
          },
        ]),
      ],
    },
    {
      area: "Produto",
      description: "Termos para descoberta, priorização e execução de produto.",
      roles: [
        role("Product Manager", [
          {
            term: "Roadmap",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando definiu plano de evolução do produto.",
          },
          {
            term: "Descoberta",
            whereToUse: "Experiência / Projetos",
            whenItMakesSense:
              "Quando validou problemas e oportunidades com usuários.",
          },
        ]),
        role("Product Analyst", [
          {
            term: "Funil",
            whereToUse: "Experiência / Resultados",
            whenItMakesSense: "Quando analisou conversão por etapas.",
          },
          {
            term: "Experimentação",
            whereToUse: "Experiência",
            whenItMakesSense:
              "Quando participou de testes e análises de impacto.",
          },
        ]),
      ],
    },
    {
      area: "Marketing",
      description: "Termos para aquisição, conteúdo e performance.",
      roles: [
        role("Analista de Marketing", [
          {
            term: "Mídia paga",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando geriu campanhas de aquisição.",
          },
          {
            term: "SEO",
            whereToUse: "Competências / Projetos",
            whenItMakesSense:
              "Quando trabalhou com conteúdo e ranking orgânico.",
          },
        ]),
        role("Social Media", [
          {
            term: "Calendário editorial",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando planejou publicações por canal.",
          },
          {
            term: "Engajamento",
            whereToUse: "Resultados",
            whenItMakesSense: "Quando mediu crescimento e interações.",
          },
        ]),
      ],
    },
    {
      area: "Vendas",
      description: "Termos para prospecção, negociação e fechamento.",
      roles: [
        role("SDR", [
          {
            term: "Prospecção ativa",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando gerou oportunidades outbound.",
          },
          {
            term: "Qualificação",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando aplicou critérios para leads.",
          },
        ]),
        role("Executivo de Vendas", [
          {
            term: "Pipeline",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando geriu etapas de oportunidades.",
          },
          {
            term: "Negociação",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando conduziu propostas comerciais.",
          },
        ]),
      ],
    },
    {
      area: "Financeiro",
      description: "Termos para controle, análise e fechamento financeiro.",
      roles: [
        role("Analista Financeiro", [
          {
            term: "Fluxo de caixa",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando monitorou entradas e saídas.",
          },
          {
            term: "Orçamento",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando participou de planejamento financeiro.",
          },
        ]),
        role("Assistente Financeiro", [
          {
            term: "Contas a pagar",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando processou e conciliou pagamentos.",
          },
          {
            term: "Conciliação bancária",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando conferiu movimentos e lançamentos.",
          },
        ]),
      ],
    },
    {
      area: "RH",
      description:
        "Termos para recrutamento, desenvolvimento e operações de pessoas.",
      roles: [
        role("Analista de RH", [
          {
            term: "Recrutamento e seleção",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando conduziu processos seletivos.",
          },
          {
            term: "Onboarding",
            whereToUse: "Experiência",
            whenItMakesSense:
              "Quando estruturou entrada de novos colaboradores.",
          },
        ]),
        role("Business Partner", [
          {
            term: "Gestão de desempenho",
            whereToUse: "Experiência",
            whenItMakesSense:
              "Quando apoiou lideranças em ciclos de avaliação.",
          },
          {
            term: "Clima organizacional",
            whereToUse: "Projetos / Resultados",
            whenItMakesSense: "Quando mediu e atuou em clima e engajamento.",
          },
        ]),
      ],
    },
    {
      area: "Administrativo",
      description: "Termos para suporte operacional e rotinas administrativas.",
      roles: [
        role("Assistente Administrativo", [
          {
            term: "Controle de documentos",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando organizou contratos e registros.",
          },
          {
            term: "Atendimento interno",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando apoiou times e áreas da empresa.",
          },
        ]),
        role("Analista Administrativo", [
          {
            term: "Processos internos",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando mapeou e padronizou rotinas.",
          },
          {
            term: "Relatórios gerenciais",
            whereToUse: "Experiência / Resultados",
            whenItMakesSense: "Quando consolidou informações para decisão.",
          },
        ]),
      ],
    },
    {
      area: "Engenharia",
      description:
        "Termos para planejamento técnico e execução de projetos de engenharia.",
      roles: [
        role("Engenheiro de Processos", [
          {
            term: "Mapeamento de processos",
            whereToUse: "Experiência",
            whenItMakesSense:
              "Quando analisou fluxos e eficiência operacional.",
          },
          {
            term: "Lean",
            whereToUse: "Competências / Experiência",
            whenItMakesSense: "Quando aplicou melhoria contínua em operações.",
          },
        ]),
        role("Engenheiro de Projetos", [
          {
            term: "Cronograma",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando planejou etapas e entregas técnicas.",
          },
          {
            term: "Gestão de riscos",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando tratou riscos de prazo, custo ou escopo.",
          },
        ]),
      ],
    },
    {
      area: "Atendimento ao cliente",
      description: "Termos para suporte, experiência e retenção de clientes.",
      roles: [
        role("Analista de Suporte", [
          {
            term: "Resolução de chamados",
            whereToUse: "Experiência",
            whenItMakesSense:
              "Quando atuou em atendimento técnico ou funcional.",
          },
          {
            term: "SLA",
            whereToUse: "Experiência / Resultados",
            whenItMakesSense:
              "Quando acompanhou tempo e qualidade de resposta.",
          },
        ]),
        role("Customer Success", [
          {
            term: "Onboarding de clientes",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando guiou ativação inicial de contas.",
          },
          {
            term: "Retenção",
            whereToUse: "Resultados",
            whenItMakesSense:
              "Quando atuou para reduzir churn e ampliar valor entregue.",
          },
        ]),
      ],
    },
    {
      area: "Gestão/Liderança",
      description:
        "Termos para liderança de times, planejamento e entrega de resultados.",
      roles: [
        role("Coordenador", [
          {
            term: "Gestão de equipe",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando liderou pessoas e rotina operacional.",
          },
          {
            term: "Acompanhamento de metas",
            whereToUse: "Resultados",
            whenItMakesSense: "Quando monitorou indicadores do time.",
          },
        ]),
        role("Gerente", [
          {
            term: "Estratégia",
            whereToUse: "Experiência",
            whenItMakesSense: "Quando definiu direção e prioridades da área.",
          },
          {
            term: "Gestão orçamentária",
            whereToUse: "Experiência / Competências",
            whenItMakesSense: "Quando planejou e controlou recursos.",
          },
        ]),
      ],
    },
  ],
  faq: [
    {
      question: "Quantas palavras-chave devo colocar no currículo?",
      answer:
        "Não existe número fixo. Priorize termos relevantes para sua experiência e para a vaga.",
    },
    {
      question: "Posso colocar palavras-chave que não domino?",
      answer:
        "Não é recomendado. Use apenas termos que você realmente consegue sustentar.",
    },
    {
      question: "Onde colocar competências técnicas?",
      answer:
        "Em competências, experiências e projetos, sempre com contexto de uso.",
    },
    {
      question: "Palavras-chave garantem aprovação em ATS?",
      answer:
        "Não. Elas ajudam aderência, mas não garantem aprovação ou contratação.",
    },
    {
      question: "Devo adaptar palavras-chave para cada vaga?",
      answer: "Sim. Cada vaga prioriza termos e responsabilidades diferentes.",
    },
    {
      question: "O que fazer quando a vaga tem muitos requisitos?",
      answer:
        "Priorize os requisitos centrais da vaga e conecte com evidências reais do seu histórico.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "Currículo ATS" },
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "Adaptar currículo para vaga",
    },
    { href: "/curriculo-gupy", label: "Currículo para Gupy" },
    { href: "/modelo-curriculo-ats", label: "Modelo de currículo ATS" },
    {
      href: "/blog/palavras-chave-curriculo",
      label: "Blog: como usar palavras-chave no currículo",
    },
    { href: "/blog/curriculo-ats", label: "Blog: currículo ATS" },
    {
      href: "/blog/como-adaptar-curriculo-para-vaga",
      label: "Blog: adaptar currículo para vaga",
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
