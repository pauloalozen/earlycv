import type { SeoPageDefinition } from "../types";

export const curriculoPorVagaPage: SeoPageDefinition = {
  slug: "curriculo-por-vaga",
  path: "/curriculo-por-vaga",
  published: true,
  updatedAt: "2026-07-19",
  sitemap: {
    changeFrequency: "weekly",
    priority: 0.8,
  },
  pageType: "transactional",
  category: "adaptacao",
  seo: {
    title:
      "Currículo por Vaga: como personalizar o CV para cada oportunidade | EarlyCV",
    description:
      "Entenda por que enviar o mesmo currículo para todas as vagas reduz suas chances e como personalizar de forma prática e rápida.",
    keywords: [
      "cv por vaga",
      "currículo por vaga",
      "personalizar currículo",
      "currículo personalizado",
      "adaptar cv para vaga",
    ],
  },
  hero: {
    title:
      "Currículo por vaga: por que personalizar e como fazer sem perder horas",
    description:
      "Enviar o mesmo currículo para todas as vagas é a forma mais comum de desperdiçar candidaturas boas. Personalizar não significa reescrever — significa ajustar o foco para o que cada vaga pede.",
  },
  sections: [
    {
      heading: "Por que currículo genérico reduz suas chances",
      paragraphs: [
        "Currículos personalizados têm cerca de 3 vezes mais chance de avançar para as próximas etapas do que versões genéricas enviadas em massa. A diferença não está na experiência — está em como ela é apresentada para cada vaga.",
        "Sistemas ATS comparam os termos do seu currículo com os da descrição da vaga e geram um score de aderência antes de qualquer leitura humana. Um currículo que não usa o vocabulário da vaga perde pontuação, mesmo com experiência equivalente.",
        "Quando chega à leitura humana, o recrutador costuma gastar poucos segundos na primeira triagem — na faixa de 6 a 8 segundos. Nesse tempo, ele precisa perceber que você é relevante para aquela vaga específica. Um currículo genérico raramente passa essa impressão rápido o suficiente.",
      ],
    },
    {
      heading: "O que personalizar em cada currículo",
      paragraphs: [
        "O resumo profissional é o ponto de maior impacto por menor esforço: um bloco curto no topo do currículo que pode ser reescrito em poucos minutos para espelhar o vocabulário e as prioridades da vaga.",
        "A ordem das experiências também importa. As mais relevantes para aquela vaga específica devem vir primeiro, mesmo que não sejam as mais recentes cronologicamente dentro de uma mesma seção.",
        "As habilidades destacadas devem espelhar a linguagem exata usada na vaga — se a empresa fala em \"gestão de stakeholders\", use esse termo, não um sinônimo.",
        "O que não precisa mudar: dados pessoais, formação acadêmica e o histórico completo de empregos. Essas informações permanecem estáveis entre candidaturas.",
      ],
      bullets: [
        "Resumo profissional: reescreva para espelhar a vaga",
        "Ordem das experiências: mais relevante primeiro",
        "Habilidades: use a linguagem exata da vaga",
        "O que não muda: dados pessoais, formação, histórico completo",
      ],
    },
    {
      heading: "Passo a passo para personalizar em menos de 15 minutos",
      paragraphs: [
        "Primeiro, leia a descrição da vaga e grife os termos que aparecem como obrigatórios ou que se repetem mais de uma vez — eles indicam prioridade real do processo seletivo.",
        "Segundo, compare com o seu currículo atual: quais desses termos já aparecem e quais estão faltando ou enterrados em algum lugar pouco visível do documento?",
        "Terceiro, ajuste o resumo profissional e a seção de habilidades para espelhar os termos que você identificou, sempre com base em experiência real.",
        "Quarto, revise se os verbos de ação e os resultados descritos nas experiências conectam com o tipo de impacto que a vaga espera. Esse último passo costuma ser rápido quando os três anteriores já foram feitos.",
      ],
      bullets: [
        "1) Grifar termos obrigatórios e repetidos da vaga",
        "2) Comparar com o currículo atual e identificar lacunas",
        "3) Ajustar resumo e habilidades",
        "4) Revisar verbos e resultados das experiências",
      ],
    },
    {
      heading: "Personalizar currículo para diferentes tipos de vaga",
      paragraphs: [
        "Vaga de liderança e vaga técnica pedem destaques diferentes mesmo quando o histórico é o mesmo: liderança valoriza decisão, gestão de time e resultado de negócio; vaga técnica valoriza profundidade, ferramentas específicas e execução.",
        "Em transição de carreira, o trabalho é reposicionar experiências anteriores sob um ângulo relevante para a nova área — habilidades como gestão, comunicação e resolução de problemas costumam atravessar áreas diferentes.",
        "Vagas internacionais geralmente pedem currículo sem foto, sem dados pessoais como estado civil ou idade, e em formato mais direto — vale revisar convenções do país e do idioma antes de enviar.",
      ],
    },
    {
      heading: "Erros comuns ao tentar personalizar",
      paragraphs: [
        "Inventar experiências ou habilidades que você não tem é o erro mais arriscado: pode passar pelo ATS, mas não resiste a uma entrevista técnica e compromete sua credibilidade.",
        "Mudar tanto o currículo entre candidaturas que ele perde coerência com seu histórico real ou com seu perfil no LinkedIn também gera desconfiança.",
        "Personalizar só o título profissional e deixar resumo e experiências iguais é um ajuste superficial que raramente move o ponteiro — o impacto real está no conjunto.",
      ],
      bullets: [
        "Inventar experiências ou habilidades",
        "Perder coerência entre versões do currículo",
        "Personalizar só o título e deixar o resto igual",
      ],
    },
    {
      heading: "Como o EarlyCV faz isso automaticamente",
      paragraphs: [
        "Você cola a descrição da vaga e faz upload do currículo. O EarlyCV compara os dois documentos, identifica lacunas de aderência e gera uma versão personalizada com foco no que a vaga pede — sem inventar nada, apenas reorganizando e destacando o que já existe no seu histórico real.",
      ],
    },
  ],
  faq: [
    {
      question: "Vale a pena personalizar o currículo para cada vaga?",
      answer:
        "Sim. Currículos personalizados têm cerca de 3 vezes mais chance de avançar para as próximas etapas do processo seletivo do que versões genéricas enviadas para todas as vagas.",
    },
    {
      question: "Quanto tempo leva para personalizar um currículo por vaga?",
      answer:
        "Manualmente, entre 15 e 30 minutos concentrando o ajuste em resumo profissional, ordem das experiências e habilidades. Com o EarlyCV, esse processo cai para menos de 2 minutos.",
    },
    {
      question: "Personalizar currículo por vaga significa inventar experiência?",
      answer:
        "Não. Significa reorganizar, destacar e ajustar a linguagem do que você já viveu para conversar melhor com cada vaga específica. O EarlyCV nunca inventa informações.",
    },
  ],
  relatedLinks: [
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "adaptar currículo para cada vaga",
    },
    { href: "/preparar-curriculo", label: "preparar currículo" },
    {
      href: "/blog/como-adaptar-curriculo-para-vaga",
      label: "Blog: como adaptar o currículo para cada vaga",
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
