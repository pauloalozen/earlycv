import type { SeoPageDefinition } from "../types";

export const prepararCurriculoPage: SeoPageDefinition = {
  slug: "preparar-curriculo",
  path: "/preparar-curriculo",
  published: true,
  updatedAt: "2026-07-19",
  sitemap: {
    changeFrequency: "weekly",
    priority: 0.8,
  },
  pageType: "transactional",
  category: "preparacao",
  seo: {
    title:
      "Preparar Currículo: passo a passo para montar um CV que avança | EarlyCV",
    description:
      "Saiba como preparar o currículo do zero ou revisar o que você já tem: estrutura, linguagem, palavras-chave e adaptação por vaga.",
    keywords: [
      "preparar currículo",
      "como preparar currículo",
      "prepara cv",
      "montar currículo",
      "como montar currículo",
    ],
  },
  hero: {
    title: "Como preparar o currículo para se candidatar com mais chances",
    description:
      "Preparar o currículo vai além de listar experiências. O que separa um currículo que avança de um que fica parado é a combinação de estrutura clara, linguagem objetiva e adaptação para cada vaga.",
  },
  sections: [
    {
      heading: "O que significa preparar um currículo de verdade",
      paragraphs: [
        "Ter um currículo e ter um currículo pronto para candidatura são coisas diferentes. O primeiro existe como documento. O segundo foi pensado para passar por um filtro automático, ser lido em poucos segundos por um recrutador e convencer alguém a te chamar para conversar.",
        "Preparar currículo envolve três camadas que trabalham juntas: estrutura (como a informação está organizada), conteúdo (o que você diz sobre sua experiência) e adaptação (o quanto isso conversa com a vaga específica).",
        "Um documento pode ter ótima estrutura e conteúdo fraco, ou o contrário. As duas coisas precisam estar alinhadas — e a terceira camada, adaptação, é o que normalmente falta mesmo em currículos bem escritos.",
      ],
    },
    {
      heading: "Estrutura básica de um currículo que funciona",
      paragraphs: [
        "A ordem das seções importa tanto para leitura humana quanto para sistemas ATS. Uma sequência segura é: cabeçalho (nome e contato), resumo profissional, experiência, formação e habilidades.",
        "O cabeçalho precisa ter nome, telefone, e-mail e, se fizer sentido, LinkedIn — sem ícones substituindo texto. O resumo profissional é um bloco curto de 3 a 4 linhas que situa quem você é e o que busca. A experiência é o corpo principal do documento. Formação e habilidades fecham o currículo, com informações objetivas.",
        "O que pode ser omitido: objetivo genérico, seção de \"sobre mim\" pessoal, foto (na maioria dos contextos de tech e vagas internacionais) e informações desatualizadas de mais de 10-15 anos, salvo se muito relevantes.",
        "Um ponto técnico que muita gente ignora: ATS lê o currículo em texto puro. Tabelas, colunas múltiplas e caixas de texto podem embaralhar a leitura e fazer seções inteiras desaparecerem do que o sistema processa.",
      ],
      bullets: [
        "Cabeçalho: nome, telefone, e-mail, LinkedIn",
        "Resumo profissional: 3 a 4 linhas",
        "Experiência profissional: corpo principal",
        "Formação acadêmica",
        "Habilidades: lista objetiva",
      ],
    },
    {
      heading: "Como descrever experiências com impacto",
      paragraphs: [
        "A estrutura que funciona é simples: verbo de ação + resultado + contexto. Em vez de descrever uma responsabilidade, você descreve o que fez e o efeito disso.",
        'Exemplo prático: "Reduzi tempo de onboarding em 30% automatizando o processo de integração de novos funcionários" diz muito mais do que "Responsável pelo processo de onboarding".',
        'Evite abrir bullets com "responsável por..." — essa construção descreve uma função, não uma ação. Prefira verbos fortes no passado: desenvolvi, liderei, implementei, reduzi, aumentei, estruturei.',
        "Quando não existe um número concreto para citar, descreva o resultado de forma qualitativa e específica: o que mudou, quem foi impactado, qual problema foi resolvido. Um resultado bem descrito sem número ainda é mais forte do que uma lista de tarefas.",
      ],
    },
    {
      heading: "Palavras-chave: como incluir sem forçar",
      paragraphs: [
        "Sistemas ATS e recrutadores buscam termos específicos porque é assim que filtram candidatos entre centenas de candidaturas. Currículos sem os termos certos ficam invisíveis, mesmo com experiência real por trás.",
        "A forma mais segura de extrair as palavras-chave certas é ler a descrição da vaga com atenção e marcar os termos técnicos, ferramentas e responsabilidades que se repetem. Esses termos indicam prioridade real da empresa.",
        "O lugar de cada palavra-chave importa: no resumo profissional (os termos mais centrais), dentro dos bullets de experiência (com contexto e resultado) e na seção de habilidades (como cobertura complementar, não como fonte principal).",
      ],
    },
    {
      heading: "Adaptação por vaga: o passo que mais candidatos pulam",
      paragraphs: [
        "Um currículo único enviado para todas as vagas reduz a taxa de resposta, mesmo quando a experiência é forte. Cada empresa prioriza termos e critérios diferentes, e um documento genérico raramente reflete isso.",
        "Adaptar não significa reescrever tudo do zero. Na maioria dos casos, o que muda é o título profissional, o resumo, a ordem das experiências mais relevantes e alguns termos-chave — o restante do currículo permanece igual.",
        "Esse ajuste concentrado costuma levar entre 15 e 30 minutos quando feito manualmente, e é a etapa que mais diferencia quem recebe retorno de quem não recebe.",
      ],
    },
    {
      heading: "Erros comuns na hora de preparar o currículo",
      paragraphs: [
        "Alguns erros são pequenos no papel, mas custam entrevistas na prática. Vale revisar antes de enviar qualquer candidatura.",
      ],
      bullets: [
        'Nome de arquivo confuso, tipo "curriculo_final_v3.pdf" — prefira "Nome-Sobrenome-Curriculo.pdf"',
        "PDF que não é selecionável (imagem escaneada) — o ATS não consegue extrair nada dele",
        "Foto no currículo quando a vaga é de tech ou o processo é internacional",
        'Objetivo genérico no topo, como "busco oportunidade de crescimento profissional" — não diz nada específico sobre você',
      ],
    },
    {
      heading: "Como o EarlyCV ajuda na preparação",
      paragraphs: [
        "Você cola a descrição da vaga e envia seu currículo. O EarlyCV compara os dois documentos, mostra quais termos e requisitos estão ausentes e sugere ajustes de estrutura e conteúdo — sem inventar nenhuma experiência, apenas reorganizando e destacando o que já existe no seu histórico.",
      ],
    },
  ],
  faq: [
    {
      question: "Por onde começar a preparar o currículo?",
      answer:
        "Comece pela estrutura: cabeçalho, resumo profissional, experiência, formação e habilidades, nessa ordem. Depois revise o conteúdo de cada seção e, por último, adapte para a vaga específica que vai se candidatar.",
    },
    {
      question: "Preciso ter um currículo diferente para cada vaga?",
      answer:
        "O documento base pode ser o mesmo, mas o resumo, a ordem das experiências e alguns termos-chave devem se ajustar a cada vaga. Isso aumenta bastante a taxa de resposta em comparação a um currículo genérico.",
    },
    {
      question: "Como saber se meu currículo está bem preparado?",
      answer:
        "Compare seu currículo com a descrição da vaga e veja se os termos e requisitos principais aparecem no seu documento com contexto real. O EarlyCV faz essa comparação automaticamente e mostra onde estão as lacunas.",
    },
  ],
  relatedLinks: [
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "adaptar currículo para cada vaga",
    },
    {
      href: "/palavras-chave-curriculo",
      label: "palavras-chave para currículo",
    },
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
