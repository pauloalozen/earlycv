import type { SeoKeywordRole, SeoPageDefinition } from "../types";

const BASE_KEYWORDS: SeoKeywordRole["keywords"] = [
  {
    term: "Planejamento",
    whereToUse: "Resumo / Experiencia",
    whenItMakesSense: "Quando voce definiu prioridades, escopo ou cronogramas.",
  },
  {
    term: "Execucao",
    whereToUse: "Experiencia",
    whenItMakesSense: "Quando voce conduziu entregas de ponta a ponta.",
  },
  {
    term: "Indicadores",
    whereToUse: "Experiencia / Resultados",
    whenItMakesSense: "Quando voce acompanhou metas e mediu performance.",
  },
  {
    term: "Melhoria continua",
    whereToUse: "Experiencia / Projetos",
    whenItMakesSense: "Quando voce revisou processos e reduziu gargalos.",
  },
  {
    term: "Comunicacao",
    whereToUse: "Resumo / Competencias",
    whenItMakesSense: "Quando atuou com times e stakeholders diferentes.",
  },
  {
    term: "Colaboracao",
    whereToUse: "Experiencia",
    whenItMakesSense: "Quando trabalhou com equipes multidisciplinares.",
  },
  {
    term: "Priorizacao",
    whereToUse: "Experiencia / Competencias",
    whenItMakesSense: "Quando precisou decidir entre demandas concorrentes.",
  },
  {
    term: "Qualidade",
    whereToUse: "Experiencia / Projetos",
    whenItMakesSense:
      "Quando definiu criterios, revisoes ou controles de qualidade.",
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
    title: "Palavras-chave para curriculo: lista por area e cargo | EarlyCV",
    description:
      "Veja exemplos de palavras-chave para curriculo por area, cargo e senioridade. Aprenda como usar termos da vaga sem exagerar e compare seu CV com a vaga no EarlyCV.",
  },
  hero: {
    title: "Palavras-chave para curriculo: lista por area, cargo e senioridade",
    description:
      "Veja exemplos de termos que aparecem em vagas e entenda como usar palavras-chave no curriculo sem exagerar ou inventar experiencia.",
  },
  alertMessage:
    "Nao copie palavras-chave aleatorias. O ideal e usar apenas termos que facam sentido para sua experiencia e para a vaga desejada.",
  sections: [
    {
      heading: "O que sao palavras-chave no curriculo",
      paragraphs: [
        "Sao termos que descrevem competencias, ferramentas, responsabilidades e contextos comuns nas vagas da sua area.",
      ],
    },
    {
      heading: "Como usar palavras-chave sem exagerar",
      bullets: [
        "Use contexto real nas experiencias",
        "Nao inclua termos que voce nao domina",
        "Adapte para cada vaga",
        "Evite listas soltas sem evidencia",
      ],
    },
    {
      heading: "Onde colocar palavras-chave",
      bullets: [
        "Resumo profissional",
        "Experiencia",
        "Competencias",
        "Projetos",
        "Certificacoes",
        "Formacao",
      ],
    },
    {
      heading: "Erros comuns",
      bullets: [
        "Copiar a descricao da vaga inteira",
        "Colocar ferramentas que nao domina",
        "Repetir palavra-chave sem contexto",
        "Criar secao de competencias gigante",
        "Ignorar experiencias reais mais relevantes",
        "Usar o mesmo curriculo para todas as vagas",
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
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando desenvolveu ou integrou APIs.",
          },
          {
            term: "Node.js",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando construiu servicos backend com Node.",
          },
        ]),
        role("Desenvolvedor Frontend", [
          {
            term: "React",
            whereToUse: "Experiencia / Projetos",
            whenItMakesSense: "Quando desenvolveu interfaces com React.",
          },
          {
            term: "TypeScript",
            whereToUse: "Competencias",
            whenItMakesSense: "Quando tipou codigo e melhorou manutencao.",
          },
        ]),
      ],
    },
    {
      area: "Dados e BI",
      description: "Termos para analise, modelagem e visualizacao de dados.",
      roles: [
        role("Analista de Dados", [
          {
            term: "SQL",
            whereToUse: "Competencias / Experiencia",
            whenItMakesSense: "Quando extraiu e analisou dados.",
          },
          {
            term: "Power BI",
            whereToUse: "Experiencia / Projetos",
            whenItMakesSense: "Quando montou dashboards e relatorios.",
          },
        ]),
        role("Analista de BI", [
          {
            term: "Modelagem dimensional",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando estruturou fatos e dimensoes.",
          },
          {
            term: "ETL",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense:
              "Quando automatizou carga e transformacao de dados.",
          },
        ]),
      ],
    },
    {
      area: "Produto",
      description: "Termos para descoberta, priorizacao e execucao de produto.",
      roles: [
        role("Product Manager", [
          {
            term: "Roadmap",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando definiu plano de evolucao do produto.",
          },
          {
            term: "Descoberta",
            whereToUse: "Experiencia / Projetos",
            whenItMakesSense:
              "Quando validou problemas e oportunidades com usuarios.",
          },
        ]),
        role("Product Analyst", [
          {
            term: "Funil",
            whereToUse: "Experiencia / Resultados",
            whenItMakesSense: "Quando analisou conversao por etapas.",
          },
          {
            term: "Experimentacao",
            whereToUse: "Experiencia",
            whenItMakesSense:
              "Quando participou de testes e analises de impacto.",
          },
        ]),
      ],
    },
    {
      area: "Marketing",
      description: "Termos para aquisicao, conteudo e performance.",
      roles: [
        role("Analista de Marketing", [
          {
            term: "Midia paga",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando geriu campanhas de aquisicao.",
          },
          {
            term: "SEO",
            whereToUse: "Competencias / Projetos",
            whenItMakesSense:
              "Quando trabalhou com conteudo e ranking organico.",
          },
        ]),
        role("Social Media", [
          {
            term: "Calendario editorial",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando planejou publicacoes por canal.",
          },
          {
            term: "Engajamento",
            whereToUse: "Resultados",
            whenItMakesSense: "Quando mediu crescimento e interacoes.",
          },
        ]),
      ],
    },
    {
      area: "Vendas",
      description: "Termos para prospeccao, negociacao e fechamento.",
      roles: [
        role("SDR", [
          {
            term: "Prospeccao ativa",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando gerou oportunidades outbound.",
          },
          {
            term: "Qualificacao",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando aplicou criterios para leads.",
          },
        ]),
        role("Executivo de Vendas", [
          {
            term: "Pipeline",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando geriu etapas de oportunidades.",
          },
          {
            term: "Negociacao",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando conduziu propostas comerciais.",
          },
        ]),
      ],
    },
    {
      area: "Financeiro",
      description: "Termos para controle, analise e fechamento financeiro.",
      roles: [
        role("Analista Financeiro", [
          {
            term: "Fluxo de caixa",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando monitorou entradas e saidas.",
          },
          {
            term: "Orcamento",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando participou de planejamento financeiro.",
          },
        ]),
        role("Assistente Financeiro", [
          {
            term: "Contas a pagar",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando processou e conciliou pagamentos.",
          },
          {
            term: "Conciliacao bancaria",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando conferiu movimentos e lancamentos.",
          },
        ]),
      ],
    },
    {
      area: "RH",
      description:
        "Termos para recrutamento, desenvolvimento e operacoes de pessoas.",
      roles: [
        role("Analista de RH", [
          {
            term: "Recrutamento e selecao",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando conduziu processos seletivos.",
          },
          {
            term: "Onboarding",
            whereToUse: "Experiencia",
            whenItMakesSense:
              "Quando estruturou entrada de novos colaboradores.",
          },
        ]),
        role("Business Partner", [
          {
            term: "Gestao de desempenho",
            whereToUse: "Experiencia",
            whenItMakesSense:
              "Quando apoiou liderancas em ciclos de avaliacao.",
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
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando organizou contratos e registros.",
          },
          {
            term: "Atendimento interno",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando apoiou times e areas da empresa.",
          },
        ]),
        role("Analista Administrativo", [
          {
            term: "Processos internos",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando mapeou e padronizou rotinas.",
          },
          {
            term: "Relatorios gerenciais",
            whereToUse: "Experiencia / Resultados",
            whenItMakesSense: "Quando consolidou informacoes para decisao.",
          },
        ]),
      ],
    },
    {
      area: "Engenharia",
      description:
        "Termos para planejamento tecnico e execucao de projetos de engenharia.",
      roles: [
        role("Engenheiro de Processos", [
          {
            term: "Mapeamento de processos",
            whereToUse: "Experiencia",
            whenItMakesSense:
              "Quando analisou fluxos e eficiencia operacional.",
          },
          {
            term: "Lean",
            whereToUse: "Competencias / Experiencia",
            whenItMakesSense: "Quando aplicou melhoria continua em operacoes.",
          },
        ]),
        role("Engenheiro de Projetos", [
          {
            term: "Cronograma",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando planejou etapas e entregas tecnicas.",
          },
          {
            term: "Gestao de riscos",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando tratou riscos de prazo, custo ou escopo.",
          },
        ]),
      ],
    },
    {
      area: "Atendimento ao cliente",
      description: "Termos para suporte, experiencia e retencao de clientes.",
      roles: [
        role("Analista de Suporte", [
          {
            term: "Resolucao de chamados",
            whereToUse: "Experiencia",
            whenItMakesSense:
              "Quando atuou em atendimento tecnico ou funcional.",
          },
          {
            term: "SLA",
            whereToUse: "Experiencia / Resultados",
            whenItMakesSense:
              "Quando acompanhou tempo e qualidade de resposta.",
          },
        ]),
        role("Customer Success", [
          {
            term: "Onboarding de clientes",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando guiou ativacao inicial de contas.",
          },
          {
            term: "Retencao",
            whereToUse: "Resultados",
            whenItMakesSense:
              "Quando atuou para reduzir churn e ampliar valor entregue.",
          },
        ]),
      ],
    },
    {
      area: "Gestao/Lideranca",
      description:
        "Termos para lideranca de times, planejamento e entrega de resultados.",
      roles: [
        role("Coordenador", [
          {
            term: "Gestao de equipe",
            whereToUse: "Experiencia",
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
            term: "Estrategia",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando definiu direcao e prioridades da area.",
          },
          {
            term: "Gestao orcamentaria",
            whereToUse: "Experiencia / Competencias",
            whenItMakesSense: "Quando planejou e controlou recursos.",
          },
        ]),
      ],
    },
  ],
  faq: [
    {
      question: "Quantas palavras-chave devo colocar no curriculo?",
      answer:
        "Nao existe numero fixo. Priorize termos relevantes para sua experiencia e para a vaga.",
    },
    {
      question: "Posso colocar palavras-chave que nao domino?",
      answer:
        "Nao e recomendado. Use apenas termos que voce realmente consegue sustentar.",
    },
    {
      question: "Onde colocar competencias tecnicas?",
      answer:
        "Em competencias, experiencias e projetos, sempre com contexto de uso.",
    },
    {
      question: "Palavras-chave garantem aprovacao em ATS?",
      answer:
        "Nao. Elas ajudam aderencia, mas nao garantem aprovacao ou contratacao.",
    },
    {
      question: "Devo adaptar palavras-chave para cada vaga?",
      answer: "Sim. Cada vaga prioriza termos e responsabilidades diferentes.",
    },
    {
      question: "O que fazer quando a vaga tem muitos requisitos?",
      answer:
        "Priorize os requisitos centrais da vaga e conecte com evidencias reais do seu historico.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "Curriculo ATS" },
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "Adaptar curriculo para vaga",
    },
    { href: "/curriculo-gupy", label: "Curriculo para Gupy" },
    { href: "/modelo-curriculo-ats", label: "Modelo de curriculo ATS" },
    {
      href: "/blog/palavras-chave-curriculo",
      label: "Blog: como usar palavras-chave no curriculo",
    },
    { href: "/blog/curriculo-ats", label: "Blog: curriculo ATS" },
    {
      href: "/blog/como-adaptar-curriculo-para-vaga",
      label: "Blog: adaptar curriculo para vaga",
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
