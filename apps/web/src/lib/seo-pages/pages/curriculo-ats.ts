import type { SeoPageDefinition } from "../types";

export const curriculoAtsPage: SeoPageDefinition = {
  slug: "curriculo-ats",
  path: "/curriculo-ats",
  published: true,
  updatedAt: "2026-05-02",
  sitemap: {
    changeFrequency: "weekly",
    priority: 0.8,
  },
  pageType: "transactional",
  category: "ats",
  seo: {
    title:
      "Currículo ATS: como criar um currículo compatível com ATS | EarlyCV",
    description:
      "Saiba como criar um currículo compatível com ATS: estrutura, formatação e palavras-chave certas. Adapte o seu CV com IA no EarlyCV.",
    keywords: [
      "currículo ats",
      "curriculo ats",
      "criar currículo ats",
      "curriculo ats modelo",
      "currículo compatível com ats",
      "ats currículo",
    ],
  },
  hero: {
    title: "Currículo ATS: como criar um currículo compatível com ATS",
    description:
      "Currículo ATS funciona quando você escreve para pessoas e para sistemas ao mesmo tempo. Com estrutura simples e termos da vaga, seu CV ganha leitura e contexto.",
  },
  sections: [
    {
      heading: "O que é ATS e por que ele rejeita currículos",
      paragraphs: [
        "ATS significa Applicant Tracking System. Em português simples, é o software que recebe currículos, organiza candidatos e ajuda na triagem antes de alguém do RH abrir seu arquivo.",
        "Hoje, no Brasil, esse fluxo está presente na maior parte das empresas médias e grandes. Plataformas como Gupy, Greenhouse, Workday e SAP SuccessFactors são exemplos comuns em processos seletivos digitais.",
        "Na prática, o caminho costuma ser direto: você envia o currículo no portal, o ATS lê o conteúdo, aplica filtros de aderência e só depois uma pessoa recrutadora vê quem passou para a próxima etapa.",
        "Quando o currículo não é bem lido, a rejeição pode acontecer cedo demais. Isso não quer dizer que seu perfil é fraco. Em muitos casos, o problema está no formato, não no conteúdo.",
        "Por isso, falar de currículo ATS não é falar de truque. É falar de clareza. Quanto mais fácil for para o sistema identificar cargo, habilidades, experiências e resultados, maior a chance de você entrar na pilha certa.",
      ],
    },
    {
      heading: "Erros de formatação que reprovam no ATS",
      paragraphs: [
        "Alguns erros parecem pequenos quando você olha no PDF, mas viram ruído para o ATS. Abaixo estão os mais comuns e o motivo de cada um quebrar a leitura.",
        "Tabelas e colunas múltiplas: muitos sistemas leem linha por linha. Quando seu conteúdo está em duas colunas, o parser pode misturar blocos e juntar frases sem sentido.",
        "Informações em cabeçalho e rodapé: diversos ATS ignoram essas áreas porque tratam como elementos de página, não como corpo principal do currículo.",
        "Fontes decorativas ou não padrão: além de piorar legibilidade humana, algumas fontes geram substituição no processamento e podem deformar palavras importantes.",
        "Fotos e ícones no lugar de texto: imagem não é palavra. Se você usa ícone para contato, por exemplo, o ATS pode não reconhecer telefone, e-mail ou localização.",
        "Arquivo no formato errado: enviar .pages, imagem exportada como PDF ou currículo escaneado reduz drasticamente a extração de texto. O ideal é PDF gerado por ferramenta ou DOCX limpo.",
        "A regra geral é simples: se você precisa explicar visualmente onde cada informação está, o ATS também vai ter dificuldade. Prefira estrutura linear e textual.",
      ],
    },
    {
      heading: "Como estruturar um currículo compatível com ATS",
      paragraphs: [
        "Um currículo compatível com ATS não precisa ser feio. Ele precisa ser previsível para leitura automática. Isso começa pela ordem das seções e por títulos convencionais.",
        "Uma base segura é: Resumo profissional, Experiência Profissional, Formação e Habilidades. Esse formato facilita para o sistema localizar rapidamente o que importa em cada bloco.",
        'Evite nomes criativos para seções. Em vez de "Minha Jornada", use "Experiência Profissional". Em vez de "Quem Sou", use "Resumo Profissional". O ATS funciona melhor com padrões de mercado.',
        "Mantenha datas consistentes. Se você usa mês/ano em um cargo, use mês/ano em todos. Essa consistência ajuda o sistema a entender tempo de experiência e sequência de carreira.",
        "Use uma única coluna com fonte sans-serif padrão, como Calibri, Arial ou Helvetica. Isso melhora leitura humana e reduz risco de parsing quebrado.",
        "Quando terminar, exporte em PDF gerado por editor de texto. Não fotografe o currículo, não escaneie e não converta por ferramentas que achatam tudo em imagem.",
        "Se quiser um checklist rápido: título do cargo claro, empresa e período visíveis, resultados descritos em texto, tecnologias nomeadas por extenso e arquivo limpo.",
      ],
    },
    {
      heading: "Palavras-chave no currículo ATS — onde e como usar",
      paragraphs: [
        "Palavras-chave funcionam quando aparecem no contexto da sua experiência. Não adianta colocar uma lista enorme de skills no fim do currículo e esperar que isso resolva sozinho.",
        'O ATS compara seu currículo com a descrição da vaga. Se a vaga pede "análise de dados" e você usa só "data analytics", alguns sistemas podem não tratar como equivalente.',
        "A dica prática é ler a vaga inteira e marcar termos que se repetem. Esses termos geralmente foram configurados como sinais de aderência no filtro inicial.",
        "Use as palavras-chave no resumo, nos bullets de experiência e na seção de habilidades, sempre sem inventar nada. Se você quer aprofundar esse tema, vale ler também nossa página sobre palavras-chave para currículo.",
      ],
      bullets: [
        "Resumo profissional com 3 a 5 termos centrais da vaga",
        "Experiências com termos em frases completas, não em bloco solto",
        "Habilidades com nomes exatos de ferramentas e métodos que você domina",
        "Ajuste de linguagem por vaga sem mudar fatos da sua trajetória",
      ],
    },
    {
      heading: "Currículo ATS vs currículo criativo — quando usar cada um",
      paragraphs: [
        "Se você está aplicando por portal online, o cenário mais provável é ATS no meio do caminho. Nesses casos, currículo ATS-friendly é quase sempre a escolha mais segura.",
        "Empresas de tecnologia, startups em escala e multinacionais costumam trabalhar com algum sistema de triagem. Mesmo quando há leitura humana cedo, o cadastro passa por plataforma.",
        "Já em contextos de design, publicidade ou projetos autorais, pode existir espaço para uma versão visual mais criativa. Ainda assim, isso depende do canal de candidatura.",
        "Regra prática: candidatura por formulário pede versão compatível com ATS. Em contato direto com portfólio, você pode testar um formato visual complementar.",
        "Também vale manter duas versões: uma otimizada para triagem automática e outra mais visual para networking ou envio direto para liderança.",
      ],
    },
    {
      heading: "Checklist final antes de enviar seu currículo ATS",
      paragraphs: [
        "Antes de clicar em enviar, faça uma revisão de 3 minutos. Esse passo evita erros que custam entrevistas mesmo quando você tem boa experiência.",
      ],
      bullets: [
        "Seu cargo alvo aparece no resumo e conversa com o título da vaga",
        "As experiências recentes têm resultados e contexto, não frases genéricas",
        "Termos importantes da vaga aparecem em mais de uma seção do currículo",
        "Formato de data está consistente em todos os cargos",
        "Arquivo final é PDF legível, sem coluna dupla e sem elementos gráficos críticos",
        "Nome do arquivo está claro, por exemplo: Nome-Sobrenome-Curriculo.pdf",
      ],
    },
    {
      heading: "Como o EarlyCV ajuda a adaptar seu currículo para ATS",
      paragraphs: [
        "Quando você cola a vaga e envia seu CV no EarlyCV, a análise compara os requisitos do anúncio com o texto do currículo, mostra os termos que estão faltando e sugere onde reforçar aderência. O foco não é reescrever sua história: é reorganizar e destacar o que você já tem para aumentar compatibilidade com ATS.",
      ],
    },
  ],
  faq: [
    {
      question: "O que é um currículo ATS?",
      answer:
        "Um currículo ATS é um documento formatado para ser lido corretamente por sistemas automáticos de triagem (Applicant Tracking System), usados por empresas para filtrar candidatos antes da análise humana.",
    },
    {
      question: "Como saber se meu currículo é compatível com ATS?",
      answer:
        "Você pode usar o EarlyCV para comparar seu currículo com a descrição da vaga e identificar os termos ausentes que o ATS está procurando.",
    },
    {
      question: "Quais erros de formatação reprovam um currículo no ATS?",
      answer:
        "Tabelas, colunas múltiplas, cabeçalhos e rodapés com informações críticas, fontes não-padrão e arquivos em formatos não suportados são os erros mais comuns.",
    },
  ],
  relatedLinks: [
    {
      href: "/palavras-chave-curriculo",
      label: "palavras-chave para currículo",
    },
    {
      href: "/adaptar-curriculo-para-vaga",
      label: "adaptar currículo para cada vaga",
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
