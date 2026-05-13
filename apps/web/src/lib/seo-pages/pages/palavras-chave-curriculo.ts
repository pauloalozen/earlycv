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
  sitemap: {
    changeFrequency: "weekly",
    priority: 0.8,
  },
  category: "palavras-chave",
  seo: {
    title: "Palavras-chave para currículo: lista por área e cargo | EarlyCV",
    description:
      "Veja quais palavras-chave usar no currículo por área e cargo. Compare seu CV com a vaga e gere uma versão alinhada gratuitamente.",
    keywords: [
      "palavras chave para curriculo",
      "palavras chaves para curriculo",
      "palavras-chave currículo ats",
      "palavras chave currículo",
      "termos para currículo",
    ],
  },
  hero: {
    title: "Palavras-chave para currículo: lista por área, cargo e senioridade",
    description:
      "Palavras-chave para currículo funcionam quando refletem o vocabulário da vaga e da sua experiência. Aqui você aprende como encontrar, priorizar e aplicar esses termos.",
  },
  alertMessage:
    "Não copie palavras-chave aleatórias. O ideal é usar apenas termos que façam sentido para sua experiência e para a vaga desejada.",
  sections: [
    {
      heading: "Por que palavras-chave importam no currículo",
      paragraphs: [
        "Em processos com ATS, o currículo vira busca por texto. Recrutadores e sistemas filtram por termos específicos, e quem não usa o vocabulário esperado pode nem aparecer na triagem inicial.",
        "Por isso, palavras-chave para currículo não são enfeite. Elas conectam sua experiência real aos critérios usados para decidir quem avança.",
        'Existe diferença entre habilidade genérica e termo de vaga. "Comunicação" é amplo demais. Já "gestão de stakeholders" ou "comunicação com times cross-funcionais" aponta contexto profissional concreto.',
        "Quando você usa termos específicos com exemplos reais, melhora leitura para o ATS e para pessoas recrutadoras. Você fica mais encontrável e mais convincente ao mesmo tempo.",
      ],
    },
    {
      heading: "Como encontrar as palavras-chave certas para cada vaga",
      paragraphs: [
        "A forma mais segura de escolher palavras-chave é começar pela descrição da vaga. Você não precisa adivinhar: a empresa já mostra os termos que considera essenciais.",
        "Primeiro, leia a vaga inteira, sem pular seções. Depois, sublinhe palavras que aparecem mais de uma vez. Se um termo surge duas vezes ou mais, ele tende a ser prioridade no filtro.",
        "Em seguida, separe ferramentas, tecnologias e metodologias citadas. Esses itens costumam ser usados como critérios objetivos de triagem.",
        'Confira também o título exato do cargo. Muitas vezes você escreve "Analista de Dados" no CV, mas a vaga está como "Analytics Engineer" ou "Business Intelligence Analyst".',
        "Por fim, revise os requisitos desejáveis. Eles também entram no radar do ATS e podem ser o diferencial quando a base de candidatos é forte.",
      ],
      bullets: [
        "1) Ler a descrição completa da vaga",
        "2) Marcar termos repetidos (2x+)",
        "3) Extrair ferramentas e tecnologias",
        "4) Validar título exato do cargo",
        "5) Incluir requisitos desejáveis relevantes",
      ],
    },
    {
      heading: "Palavras-chave por área — exemplos práticos",
      paragraphs: [
        'Cada área tem um vocabulário próprio. Recrutadores não procuram só "profissional bom"; eles procuram sinais específicos de execução. Use os exemplos abaixo como referência e adapte ao seu contexto.',
        "Tecnologia e Engenharia de Software: normalmente buscam termos ligados a entrega técnica, arquitetura e colaboração em time. Exemplos: Python, React, Node.js, APIs REST, CI/CD, microsserviços, cloud (AWS/GCP/Azure), metodologias ágeis, code review e arquitetura de sistemas.",
        "Dados e Analytics: recrutadores valorizam domínio de extração, modelagem e comunicação de análise. Exemplos: SQL, Python, Power BI, Tableau, ETL, dbt, BigQuery, análise exploratória, modelagem preditiva, A/B testing e data storytelling.",
        "Produto (Product Management): o foco costuma estar em decisão, descoberta e impacto. Exemplos: roadmap, discovery, OKRs, métricas de produto, entrevistas com usuários, priorização, go-to-market, backlog, product-led growth e NPS.",
        "Marketing Digital: aqui o peso está em aquisição, performance e retenção. Exemplos: SEO, SEM, Google Ads, Meta Ads, CRO, funil de conversão, email marketing, automação, CRM, analytics e ROAS.",
        "Gestão de Projetos: geralmente procuram estrutura de execução e governança. Exemplos: Scrum, Kanban, PMP, gestão de escopo, cronograma, gestão de riscos, PMO, stakeholders, budget e PMBOK.",
        "Não use todos os termos de uma vez. Escolha os que você realmente aplica no dia a dia e comprove com resultados, projetos ou responsabilidades específicas.",
      ],
    },
    {
      heading: "Onde colocar as palavras-chave no currículo",
      paragraphs: [
        "O lugar das palavras-chave importa tanto quanto a escolha dos termos. Distribuir bem evita currículo artificial e melhora leitura global.",
        "No resumo profissional, use de 3 a 5 termos centrais da vaga de forma natural. A ideia é mostrar foco logo no começo, sem parecer uma colagem de buzzwords.",
        "Nas experiências, inclua os termos dentro das descrições de responsabilidades e conquistas. É aqui que o ATS e o recrutador entendem se você realmente aplicou aquela habilidade.",
        "Na seção de habilidades, mantenha uma lista curta e clara. Entre 10 e 15 termos costuma ser suficiente para cobrir stack principal sem virar poluição.",
        "Em formação, certificações e cursos, use o nome exato da trilha ou ferramenta quando for relevante para a vaga. Isso ajuda na busca por credenciais específicas.",
      ],
      bullets: [
        "Resumo profissional: 3 a 5 termos prioritários",
        "Experiências: termos dentro de bullets com contexto real",
        "Habilidades: lista objetiva, sem excesso",
        "Formação e cursos: nomes oficiais quando fizer sentido",
      ],
    },
    {
      heading: "O que NÃO fazer com palavras-chave",
      paragraphs: [
        "Keyword stuffing é um dos erros mais comuns. Colocar 30 ou 40 termos em bloco sem contexto pode ser ignorado por recrutadores e perder força em ATS mais modernos.",
        "Copiar a vaga inteira para dentro do currículo também não resolve. Além de soar artificial, isso não prova experiência real e pode gerar inconsistências em entrevistas.",
        'Outro ponto é trocar termos padrão por sinônimos pouco usados no mercado. Em muitas buscas, "machine learning" tende a ser mais reconhecido do que "aprendizado de máquina".',
        "A melhor prática é simples: linguagem da vaga + fatos da sua trajetória. Se não aconteceu no seu histórico, não entra. Se aconteceu, descreva com clareza.",
      ],
    },
    {
      heading: "Como o EarlyCV identifica as palavras-chave da vaga",
      paragraphs: [
        "Você cola a descrição da vaga no EarlyCV e a análise mapeia os termos mais relevantes do anúncio. Depois, a plataforma mostra o que já aparece no currículo e o que ainda está ausente, para você ajustar com precisão e sem inventar experiência.",
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
      question: "Quais palavras-chave colocar no currículo?",
      answer:
        "As melhores palavras-chave vêm da própria descrição da vaga. Termos de hard skills, cargos mencionados e ferramentas específicas têm maior peso nos filtros ATS.",
    },
    {
      question: "Posso colocar muitas palavras-chave no currículo?",
      answer:
        "Não. Keyword stuffing é detectado tanto por ATS modernos quanto por recrutadores. Use os termos de forma natural dentro de frases que descrevem suas experiências reais.",
    },
    {
      question: "Como o EarlyCV ajuda com palavras-chave?",
      answer:
        "O EarlyCV analisa a descrição da vaga e identifica os termos mais relevantes que estão faltando no seu currículo, sugerindo onde e como incluí-los.",
    },
  ],
  relatedLinks: [
    { href: "/curriculo-ats", label: "currículo compatível com ATS" },
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "adaptar o currículo para a vaga",
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
