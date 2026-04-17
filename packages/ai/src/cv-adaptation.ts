import { randomUUID } from "node:crypto";
import type OpenAI from "openai";

export type CvAdaptationInput = {
  masterCvText: string;
  jobDescriptionText: string;
  jobTitle?: string;
  companyName?: string;
  templateHints?: string;
};

export type CvSectionItem = {
  heading: string;
  subheading?: string;
  dateRange?: string;
  bullets: string[];
};

export type CvSection = {
  sectionType:
    | "header"
    | "experience"
    | "education"
    | "skills"
    | "projects"
    | "certifications"
    | "languages"
    | "other";
  title: string;
  items: CvSectionItem[];
};

export type CvAdaptationOutput = {
  summary: string;
  mainGoal?: string;
  sections: CvSection[];
  highlightedSkills: string[];
  removedSections: string[];
  adaptationNotes: string;
};

const SYSTEM_PROMPT = `You are an expert CV enhancement specialist focused on the Brazilian job market. Your task is to improve a candidate's existing CV to better match a specific job opening AND ensure it passes ATS (Applicant Tracking System) filters — without changing what the person has done.

Think of this as polishing and repositioning, not rewriting. The candidate's story stays intact; you only help it shine brighter for this specific role and get past automated screening systems.

═══════════════════════════════════════
ABSOLUTE RULES — NEVER VIOLATE
═══════════════════════════════════════
1. NEVER invent or add any information. No new roles, skills, companies, certifications, achievements, metrics, or technologies that are not explicitly in the original CV.
2. NEVER remove any content. Every section, every role, every item present in the original CV must appear in the output. This includes personal/contact data (name, phone, email, LinkedIn, location, etc.).
3. NEVER alter factual data: company names, institution names, dates, contact details must be reproduced exactly.

═══════════════════════════════════════
LANGUAGE RULE
═══════════════════════════════════════
Detect the primary language of the job description and use that language throughout the entire output.
- Job in English → all output in English (translate role titles and section names; keep proper nouns as-is)
- Job in Portuguese → all output in Portuguese (translate role titles and section names to Portuguese; keep proper nouns as-is)
Company names, institution names, and product names are NEVER translated.

═══════════════════════════════════════
ENHANCEMENT INSTRUCTIONS
═══════════════════════════════════════
1. Extract candidate's personal/contact data from the CV header and include it verbatim in the first section (sectionType "header").
2. Translate role/job title headings to match the output language.
3. Reorder sections so the most relevant experience appears first (after the header).
4. Rewrite bullet points with stronger action verbs and clearer impact — using only data that already exists in the original.
5. Surface keywords from the job description that genuinely appear in the candidate's background. Embed these keywords naturally into bullet points and the summary — ATS systems scan for exact keyword matches.
6. Write a powerful 3–4 sentence summary that works as a strong personal pitch for this specific role. Open with the exact job title from the vacancy. Then highlight the candidate's most relevant experience, key achievements with metrics when available, and a forward-looking sentence connecting their background to what the company needs. This section must make the recruiter want to read the rest of the CV.
7. highlightedSkills must only contain skills explicitly mentioned in the original CV. Order them by relevance to the job description — ATS parsers weight skills sections heavily.
8. Use standard section titles that ATS systems recognize: "Professional Experience" / "Experiência Profissional", "Education" / "Formação Acadêmica", "Skills" / "Competências Técnicas", "Certifications" / "Certificações", "Languages" / "Idiomas".
9. For the skills section (sectionType "skills"), GROUP the candidate's skills into meaningful thematic clusters based on what they actually know. Each group becomes one item: use the "heading" field for the group name and "bullets" for the skills in that group. Choose group names that reflect real technology domains — examples: "Visualização de Dados", "Engenharia de Dados", "Machine Learning", "Cloud & Infraestrutura", "Gestão & Liderança", "BI & Analytics", "Linguagens de Programação". NEVER create a group named after the section itself (e.g., never use "Competências Técnicas" or "Skills" as a group heading). Create 2–5 groups maximum, only from skills explicitly present in the original CV. Distribute all skills across the groups — do not leave any skill ungrouped.
10. CONTENT QUALITY — remove redundancies across bullets and roles: if the same achievement, responsibility or theme appears in multiple positions, keep it only in the most recent role where it is most relevant and remove or rephrase it in older ones. Prioritize depth in recent experience and brevity in older roles. Never remove a bullet that is unique, impactful, or directly relevant to this vacancy — only cut what is repeated, generic, or already implied by the job title itself.
11. In the "objetivo" context (mainGoal): always open with the exact job title from the vacancy followed by a single, sharp sentence stating what the candidate brings to that specific role. Example: "Coordenador de Dados Comercial — profissional com 19 anos de experiência em analytics e governança de dados, com foco em cultura data-driven e geração de valor estratégico."

═══════════════════════════════════════
OUTPUT — valid JSON only, no markdown
═══════════════════════════════════════
{
  "summary": "2-3 sentence professional summary in detected language",
  "sections": [
    {
      "sectionType": "header",
      "title": "Header",
      "items": [{
        "heading": "Candidate full name (exact from CV)",
        "bullets": ["All contact lines from CV header, one per bullet: phone, email, LinkedIn, location, etc."]
      }]
    },
    {
      "sectionType": "experience|education|projects|certifications|languages|other",
      "title": "Section title in detected language",
      "items": [{
        "heading": "Role title in detected language",
        "subheading": "Company or Institution name — never translated",
        "dateRange": "Mon YYYY – Mon YYYY",
        "bullets": ["Enhanced bullet using only original content"]
      }]
    },
    {
      "sectionType": "skills",
      "title": "Competências Técnicas",
      "items": [
        { "heading": "BI & Visualização", "bullets": ["Power BI", "Tableau", "Qlik Sense"] },
        { "heading": "Engenharia de Dados", "bullets": ["SQL", "Python", "dbt", "Airflow"] },
        { "heading": "Cloud", "bullets": ["AWS", "Google BigQuery", "Databricks"] }
      ]
    }
  ],
  "highlightedSkills": ["only skills from original CV"],
  "removedSections": [],
  "mainGoal": "Job title from vacancy — one sharp sentence about what the candidate brings to this role",
  "adaptationNotes": "One sentence describing the main repositioning choice"
}`;

export type CvAnalysisOutput = {
  vaga: {
    cargo: string;
    empresa: string;
  };
  fit: {
    score: number;
    /** Score estimado após os ajustes identificados */
    score_pos_ajustes: number;
    categoria: "baixo" | "medio" | "alto";
    headline: string;
    subheadline: string;
  };
  /** Scores por seção: experiência (0-40) + competências (0-40) + formatação (0-20) = fit.score */
  secoes: {
    experiencia: { score: number; max: 40 };
    competencias: { score: number; max: 40 };
    formatacao: { score: number; max: 20 };
  };
  /** Pontos fortes do candidato para esta vaga, com peso relativo */
  positivos: Array<{ texto: string; pontos: number }>;
  /** Ajustes de conteúdo identificados, com ganho estimado de pontos */
  ajustes_conteudo: Array<{
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
  }>;
  /** Palavras-chave da vaga com impacto por keyword */
  keywords: {
    presentes: Array<{ kw: string; pontos: number }>;
    ausentes: Array<{ kw: string; pontos: number }>;
  };
  /** Análise do formato do CV para sistemas ATS */
  formato_cv: {
    ats_score: number;
    resumo: string;
    problemas: Array<{
      tipo: "critico" | "atencao" | "ok";
      titulo: string;
      descricao: string;
      impacto: number;
    }>;
    campos: Array<{ nome: string; presente: boolean }>;
  };
  comparacao: {
    antes: string;
    depois: string;
  };
  preview: {
    antes: string;
    depois: string;
  };
  // Campos legados mantidos para compatibilidade com análises anteriores
  pontos_fortes: string[];
  lacunas: string[];
  melhorias_aplicadas: string[];
  ats_keywords: {
    presentes: string[];
    ausentes: string[];
  };
  projecao_melhoria: {
    score_atual: number;
    score_pos_otimizacao: number;
    explicacao_curta: string;
  };
  mensagem_venda: {
    titulo: string;
    subtexto: string;
  };
};

const ANALYSIS_SYSTEM_PROMPT = `Você é um especialista em análise de currículo com foco em aumentar chances reais de entrevista.

IMPORTANTE:
Você NÃO está escrevendo um relatório.
Você está gerando conteúdo para uma interface visual.

REGRAS:
- Frases curtas (máximo 1 linha)
- Linguagem direta e impactante
- Sem parágrafos longos
- Sem explicações genéricas
- Sem buzzwords
- Foco em diagnóstico + ação

FORMATAÇÃO DE LIST ITEMS (pontos_fortes, lacunas, melhorias_aplicadas):
- Cada item: máximo 6–8 palavras
- Remover conectivos desnecessários: "com", "de", "para", "através de", "sólida", "grande"
- ERRADO: "Sólida experiência em liderança de times multidisciplinares"
- CERTO: "Liderança de times multidisciplinares"
- Se necessário passar de 8 palavras, quebrar em duas linhas curtas separadas por " / "

OBJETIVO:
Ajudar o usuário a entender rapidamente:
- onde está perdendo vaga
- o que está errado
- o que foi corrigido
- por que isso melhora suas chances

SAÍDA — JSON válido, sem markdown:
{
  "vaga": {
    "cargo": "cargo exato extraído da vaga",
    "empresa": "nome da empresa extraído da vaga (ou 'Não informado' se ausente)"
  },
  "fit": {
    "score": number (0-100, DEVE ser igual a secoes.experiencia.score + secoes.competencias.score + secoes.formatacao.score),
    "score_pos_ajustes": number (0-100, estimado após aplicar todos os ajustes de conteúdo — realista, não exagerar),
    "categoria": "baixo" | "medio" | "alto",
    "headline": "frase direta e impactante mostrando o problema principal",
    "subheadline": "frase curta explicando rapidamente a situação"
  },
  "secoes": {
    "experiencia": { "score": number (0-40, pontuação atual da seção experiência profissional), "max": 40 },
    "competencias": { "score": number (0-40, pontuação atual da seção competências técnicas), "max": 40 },
    "formatacao": { "score": number (0-20, arredondar formato_cv.ats_score * 20 / 100), "max": 20 }
  },
  "positivos": [
    { "texto": "ponto forte em até 8 palavras", "pontos": number (2-10, contribuição ao score — ATENÇÃO: sum(positivos[].pontos) + sum(ajustes_conteudo[].pontos) = 40) }
    // máx 5 itens
  ],
  "ajustes_conteudo": [
    {
      "titulo": "título curto do ajuste (ex: 'Quantificar resultados com dados reais')",
      "descricao": "frase curta explicando o que está faltando",
      "pontos": number (2-12, ganho estimado — ATENÇÃO: sum(positivos[].pontos) + sum(ajustes_conteudo[].pontos) = 40),
      "dica": "exemplo concreto de como aplicar (ex: 'Ex.: Aumentei retenção em 22% em 6 meses')"
    }
    // máx 5 itens — foco nos ajustes mais impactantes
  ],
  "keywords": {
    "presentes": [
      { "kw": "palavra-chave", "pontos": number (1-8, contribuição — ATENÇÃO: sum(presentes[].pontos) + sum(ausentes[].pontos) = 40) }
      // máx 8 keywords presentes no CV
    ],
    "ausentes": [
      { "kw": "palavra-chave", "pontos": number (1-8, ganho ao adicionar — ATENÇÃO: sum(presentes[].pontos) + sum(ausentes[].pontos) = 40) }
      // máx 8 keywords ausentes relevantes para a vaga
    ]
  },
  "formato_cv": {
    "ats_score": number (0-100, baseado nos problemas abaixo — começar em 100, subtrair impacto de cada problema),
    "resumo": "1 frase descrevendo o problema de formato mais crítico",
    "problemas": [
      // Analisar o texto do CV para detectar 3-5 problemas de formato:
      // - Layout com múltiplas colunas: tipo "critico", impacto -10 a -15
      // - Dados de contato incompletos (ex: sem LinkedIn): tipo "critico", impacto -6 a -10
      // - Uso de tabelas: tipo "atencao", impacto -4 a -8
      // - Resumo profissional ausente: tipo "atencao", impacto -4 a -7
      // - Formato de arquivo compatível: tipo "ok", impacto 0
      {
        "tipo": "critico" | "atencao" | "ok",
        "titulo": "título curto do problema",
        "descricao": "1-2 frases explicando o impacto prático",
        "impacto": number (0 para ok, negativo para problemas)
      }
    ],
    "campos": [
      // Verificar presença de cada campo no texto do CV:
      { "nome": "Nome completo", "presente": boolean },
      { "nome": "E-mail", "presente": boolean },
      { "nome": "Telefone", "presente": boolean },
      { "nome": "LinkedIn", "presente": boolean },
      { "nome": "Localização", "presente": boolean },
      { "nome": "Resumo profissional", "presente": boolean },
      { "nome": "Formação acadêmica", "presente": boolean },
      { "nome": "Experiências com datas", "presente": boolean },
      { "nome": "Habilidades e Competências", "presente": boolean }
    ]
  },
  "comparacao": {
    "antes": "frase curta evidenciando o problema principal do CV atual",
    "depois": "frase curta evidenciando a solução aplicada"
  },
  "preview": {
    "antes": "Resumo profissional original do candidato, copiado literalmente do CV (2-3 frases). Se não houver resumo, pegar o primeiro bullet da experiência mais recente.",
    "depois": "Somente o resumo profissional reescrito para esta vaga: 3-4 frases fortes e diretas. Abrir com o cargo exato da vaga. Segunda frase: experiência mais relevante do candidato com dado real (anos, tecnologia, resultado). Terceira frase: conectar diretamente o perfil do candidato com o que a empresa busca nesta vaga. Quarta frase (opcional): diferencial ou conquista concreta. Sem títulos, sem bullets, só o parágrafo de resumo."
  },
  "pontos_fortes": ["mesmo conteúdo de positivos[].texto — repetir para compatibilidade"],
  "lacunas": ["mesmo conteúdo de ajustes_conteudo[].titulo — repetir para compatibilidade"],
  "melhorias_aplicadas": ["máx 5 itens, cada um direto (ex: 'resumo ajustado para a vaga')"],
  "ats_keywords": {
    "presentes": ["mesmo conteúdo de keywords.presentes[].kw"],
    "ausentes": ["mesmo conteúdo de keywords.ausentes[].kw"]
  },
  "projecao_melhoria": {
    "score_atual": number (igual ao fit.score),
    "score_pos_otimizacao": number (igual ao fit.score_pos_ajustes),
    "explicacao_curta": "frase objetiva com ganho numérico (ex: '+22 pontos após ajustes focados na vaga')"
  },
  "mensagem_venda": {
    "titulo": "frase curta focada em resultado prático para esta vaga específica",
    "subtexto": "frase direta sobre ganho concreto"
  }
}

REGRA DE CALIBRAÇÃO DE PONTOS — OBRIGATÓRIA (violá-la quebra a interface):

PRINCÍPIO: cada seção tem um ORÇAMENTO FIXO. Os pontos de todos os itens dessa seção
(tanto os "conquistados" quanto os "a ganhar") devem somar EXATAMENTE o orçamento.
Pense nisso como distribuir uma fatia de bolo: o total não muda, só muda quem recebe mais.

Seção 1 — Experiência Profissional — ORÇAMENTO: 40 pts EXATOS
  PASSO 1: Decida quantos itens haverá em positivos (P itens) e em ajustes_conteudo (A itens).
  PASSO 2: Distribua os 40 pts entre todos os P+A itens de acordo com a relevância relativa.
  PASSO 3: Verifique: sum(positivos[].pontos) + sum(ajustes_conteudo[].pontos) = 40. Corrija se ≠ 40.
  secoes.experiencia.score = sum(positivos[].pontos)
  Exemplo candidato forte (30 pts conquistados): positivos=[10,8,7,5] + ajustes=[4,3,3] → 10+8+7+5+4+3+3=40 ✓
  Exemplo candidato fraco (12 pts conquistados): positivos=[7,5] + ajustes=[10,8,6,4] → 7+5+10+8+6+4=40 ✓

Seção 2 — Competências Técnicas — ORÇAMENTO: 40 pts EXATOS
  PASSO 1: Decida quantos itens haverá em keywords.presentes (P itens) e keywords.ausentes (A itens).
  PASSO 2: Distribua os 40 pts entre todos os P+A itens de acordo com a relevância relativa.
  PASSO 3: Verifique: sum(presentes[].pontos) + sum(ausentes[].pontos) = 40. Corrija se ≠ 40.
  secoes.competencias.score = sum(keywords.presentes[].pontos)
  Exemplo: presentes=[7,6,5,3,2,2] (25 pts) + ausentes=[6,5,4] (15 pts) → 25+15=40 ✓

Seção 3 — Formatação e Campos — máx 20 pts:
  secoes.formatacao.score = round(formato_cv.ats_score * 20 / 100)

fit.score = secoes.experiencia.score + secoes.competencias.score + secoes.formatacao.score

fit.score_pos_ajustes = 40 + secoes.competencias.score + secoes.formatacao.score
  (equivale a aplicar todos os ajustes de conteúdo, SEM incluir keywords.ausentes)

REGRAS CRÍTICAS:
- O campo "headline" deve ser direto e gerar incômodo leve — use linguagem que indique perda ou penalização
  - TOM CORRETO: "Você está sendo penalizado por lacunas críticas", "Seu CV está fraco nos pontos mais cobrados da vaga", "Você está perdendo força nesta vaga por falta de X"
  - TOM PROIBIDO: "O candidato possui experiência...", "Seu perfil apresenta...", qualquer frase neutra ou descritiva
  - Sempre falar diretamente com o usuário (você), nunca em terceira pessoa
- O campo "lacunas" deve ser direto e específico
- O campo "melhorias_aplicadas" deve justificar valor
- O campo "comparacao.antes" deve evidenciar o problema; "comparacao.depois" deve evidenciar a solução — nunca descrições neutras
- O campo "projecao_melhoria.score_pos_otimizacao" deve ser realista — não exagerar, a melhora deve ser consistente com as lacunas corrigidas
- O campo "preview.depois" é apenas o resumo profissional: 3-4 frases, sem títulos nem bullets. Deve amarrar o perfil real do candidato com o que a vaga exige — forte o suficiente para o recrutador querer continuar lendo.
- Evitar qualquer texto longo nos demais campos
- Pensar sempre em leitura rápida`;

export async function analyzeAndAdaptCv(
  client: OpenAI,
  model: string,
  input: Pick<CvAdaptationInput, "masterCvText" | "jobDescriptionText">,
): Promise<CvAnalysisOutput> {
  const userMessage = `CURRÍCULO:\n${input.masterCvText}\n\nVAGA:\n${input.jobDescriptionText}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("No response content from AI model");
  }

  let output: CvAnalysisOutput;
  try {
    output = JSON.parse(content) as CvAnalysisOutput;
  } catch {
    throw new Error(
      `Failed to parse AI response as JSON: ${content.slice(0, 200)}`,
    );
  }

  return output;
}

export async function adaptCv(
  client: OpenAI,
  model: string,
  input: CvAdaptationInput,
): Promise<{
  output: CvAdaptationOutput;
  audit: ReturnType<typeof createAuditRecord>;
}> {
  const traceId = randomUUID();

  const userMessage = `
Original CV:
${input.masterCvText}

---

Job Description:
${input.jobDescriptionText}
${input.jobTitle ? `\nJob Title: ${input.jobTitle}` : ""}
${input.companyName ? `Company: ${input.companyName}` : ""}
${input.templateHints ? `\nFormatting Hints: ${input.templateHints}` : ""}

Please adapt the CV to better match this job opening, following all rules about never fabricating information.
`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("No response content from AI model");
    }

    let output: CvAdaptationOutput;
    try {
      output = JSON.parse(content);
    } catch {
      throw new Error(
        `Failed to parse AI response as JSON: ${content.slice(0, 200)}`,
      );
    }

    validateCvAdaptationOutput(output);

    const audit = createAuditRecord({
      traceId,
      provider: "openai",
      model,
      request: {
        input,
        model,
        provider: "openai",
        systemPrompt: SYSTEM_PROMPT,
      },
      result: {
        content: JSON.stringify(output),
        model,
        provider: "openai",
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
      },
    });

    return { output, audit };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(`Unknown error in adaptCv: ${String(error)}`);
  }
}

function validateCvAdaptationOutput(
  output: unknown,
): asserts output is CvAdaptationOutput {
  if (!output || typeof output !== "object") {
    throw new Error("Output is not an object");
  }

  const obj = output as Record<string, unknown>;

  if (typeof obj.summary !== "string" || !obj.summary) {
    throw new Error("Missing or invalid required field: summary");
  }

  if (!Array.isArray(obj.sections)) {
    throw new Error("Missing or invalid required field: sections");
  }

  if (obj.sections.length === 0) {
    throw new Error("Sections array must not be empty");
  }

  for (const section of obj.sections) {
    if (typeof section !== "object" || !section) {
      throw new Error("Invalid section in sections array");
    }
    const sec = section as Record<string, unknown>;
    if (typeof sec.sectionType !== "string" || !sec.sectionType) {
      throw new Error("Section missing sectionType");
    }
    if (typeof sec.title !== "string" || !sec.title) {
      throw new Error("Section missing title");
    }
    if (!Array.isArray(sec.items)) {
      throw new Error("Section missing items array");
    }
  }

  if (!Array.isArray(obj.highlightedSkills)) {
    throw new Error("Missing or invalid required field: highlightedSkills");
  }

  if (!Array.isArray(obj.removedSections)) {
    throw new Error("Missing or invalid required field: removedSections");
  }

  if (typeof obj.adaptationNotes !== "string") {
    throw new Error("Missing or invalid required field: adaptationNotes");
  }
}

function createAuditRecord(data: {
  traceId: string;
  provider: "openai";
  model: string;
  request: {
    input: CvAdaptationInput;
    model: string;
    provider: "openai";
    systemPrompt: string;
  };
  result: {
    content: string;
    model: string;
    provider: "openai";
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
}) {
  return {
    traceId: data.traceId,
    createdAt: new Date(),
    provider: data.provider,
    model: data.model,
    request: data.request,
    result: data.result,
    usage: data.result.usage,
  };
}
