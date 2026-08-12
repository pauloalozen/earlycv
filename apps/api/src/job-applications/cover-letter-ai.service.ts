import { Inject, Injectable, Logger } from "@nestjs/common";
import type OpenAI from "openai";

import { getAiModel } from "../common/ai-client-factory";

// Contexto mínimo — nunca o CV/análise inteiros. Ver regra de isolamento de
// artefatos: cada artefato do Kit de Candidatura recebe só o necessário.
export type CoverLetterContext = {
  language: string;
  candidateName: string;
  professionalSummary: string;
  highlightedSkills: string[];
  remainingGaps: string[];
  keywords: string[];
  jobTitle: string;
  companyName: string;
  style: "formal" | "moderno" | "executivo" | "primeiro_emprego";
  lengthMode: "curta" | "media" | "completa" | "custom";
  maxCharacters?: number | null;
};

export type CoverLetterContent = {
  body: string;
  characterCount: number;
};

export class CoverLetterValidationError extends Error {
  constructor(reason: string) {
    super(`CoverLetter validation failed: ${reason}`);
    this.name = "CoverLetterValidationError";
  }
}

export function validateAndNormalizeCoverLetter(
  raw: unknown,
): CoverLetterContent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CoverLetterValidationError("root value is not an object");
  }

  const obj = raw as Record<string, unknown>;
  const body = typeof obj.body === "string" ? obj.body.trim() : "";

  if (body.length === 0) {
    throw new CoverLetterValidationError("body is empty");
  }

  return { body, characterCount: body.length };
}

// Travessão entrega texto gerado por IA — proibido em qualquer narrativa da
// carta. Checagem/sanitização aqui é defesa em profundidade: a regra
// primária vive no system prompt, isto é só a rede de segurança.
function containsEmDash(text: string): boolean {
  return text.includes("—");
}

function stripEmDash(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".");
}

const STYLE_GUIDANCE: Record<CoverLetterContext["style"], string> = {
  formal:
    "Tom formal e institucional, adequado para empresas tradicionais, bancos, indústrias e grandes corporações. Frases completas, vocabulário respeitoso, sem gírias ou informalidades.",
  moderno:
    "Tom moderno e direto, adequado para startups, scale-ups e empresas de tecnologia. Objetivo, com personalidade, sem soar engessado — mas sempre profissional.",
  executivo:
    "Tom executivo, adequado para posições de gerência, head ou diretoria. Foco em impacto, visão estratégica e resultados de negócio, com segurança e concisão.",
  primeiro_emprego:
    "Tom acolhedor e entusiasmado, adequado para estágio, primeiro emprego ou transição de carreira. Foco em potencial, disposição para aprender e motivação genuína, sem soar inseguro.",
};

const LENGTH_GUIDANCE: Record<CoverLetterContext["lengthMode"], string> = {
  curta:
    "Carta curta, entre 600 e 900 caracteres — adequada para campos de texto de formulários como Gupy ou Workday.",
  media:
    "Carta de tamanho médio, entre 1200 e 1700 caracteres — adequada para a maioria das candidaturas.",
  completa:
    "Carta completa, entre 2200 e 3000 caracteres — adequada para PDF, envio por e-mail ou processos tradicionais.",
  custom: "", // resolvido dinamicamente via maxCharacters
};

const SYSTEM_PROMPT = `Você é um redator especializado em cartas de apresentação para candidaturas de emprego. Sua única tarefa é escrever o corpo de uma carta de apresentação persuasiva e honesta.

REGRAS ABSOLUTAS:
1. Use APENAS os fatos fornecidos no contexto. Nunca invente projetos, tecnologias, resultados, cargos ou responsabilidades que não estejam explicitamente presentes.
2. A carta COMPLEMENTA um currículo que o candidato já enviou — ela não deve repetir literalmente o resumo profissional ou listar as mesmas competências da mesma forma. Ela deve contextualizar, explicar motivação e conectar a experiência do candidato aos requisitos da vaga.
3. Priorize mencionar os itens em "remainingGaps" — são competências que o currículo adaptado não deixou evidentes o suficiente; a carta deve reforçá-los com o que for verdadeiro no contexto fornecido, sem inventar evidência que não existe.
4. Mencione naturalmente desafios/requisitos da vaga (cargo, empresa) — a carta deve parecer escrita especificamente para esta candidatura, nunca um modelo genérico.
5. Escreva inteiramente no idioma indicado pelo campo "language" do contexto. Não decida o idioma por conta própria — apenas siga o valor fornecido.
6. Nunca inclua saudação/cabeçalho de carta formal tipo "Prezados(as)," nem despedida tipo "Atenciosamente," — devolva apenas o corpo narrativo da carta, pronto para ser inserido em um template.
7. PROIBIDO usar placeholders, colchetes ou lacunas para o candidato preencher depois — nunca escreva coisas como "[Seu Nome]", "[Nome da Empresa]", "[inserir X]" ou qualquer variação. Se precisar citar o nome do candidato, use exatamente o valor de "candidateName" fornecido no contexto. Se "candidateName" vier vazio, ou se qualquer outra informação não estiver disponível no contexto, simplesmente NÃO mencione esse dado — reescreva a frase sem ele. Um texto com uma lacuna não preenchida é um erro grave: se o candidato esquecer de completá-la antes de enviar, ele perde a candidatura.
8. PROIBIDO usar travessão (—) em qualquer lugar da narrativa, em qualquer idioma. Travessão entrega que o texto foi escrito por IA — o texto precisa soar humano. Nunca use "—" para inserir uma explicação, aposto ou pausa; reformule a frase usando vírgula, ponto final, "e", "ou" duas frases separadas, ou parênteses. Isso vale para o corpo inteiro, sem exceção.
9. Responda APENAS com o JSON estruturado, sem texto adicional, sem markdown.

FORMATO DE RESPOSTA (JSON obrigatório):
{
  "body": "corpo da carta, parágrafos separados por quebra de linha dupla"
}`;

@Injectable()
export class CoverLetterAiService {
  private readonly logger = new Logger(CoverLetterAiService.name);

  constructor(
    @Inject("COVER_LETTER_AI_CLIENT") private readonly aiClient: OpenAI,
  ) {}

  async generate(context: CoverLetterContext): Promise<CoverLetterContent> {
    if (process.env.SKIP_AI === "true") {
      this.logger.warn("[cover-letter] SKIP_AI=true — returning stub content");
      return validateAndNormalizeCoverLetter(this.buildStub(context));
    }

    const model = getAiModel("COVER_LETTER");
    const { buildDeepSeekExtraBody, buildSystemMessage, stripJsonCodeFence } =
      await import("@earlycv/ai");

    const generateOnce = async (extraInstruction?: string) => {
      const userPrompt = this.buildUserPrompt(context, extraInstruction);
      const response = await this.aiClient.chat.completions.create({
        model,
        messages: [
          buildSystemMessage(model, SYSTEM_PROMPT),
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        ...buildDeepSeekExtraBody(model),
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(stripJsonCodeFence(raw));
      } catch {
        this.logger.error("[cover-letter] Failed to parse AI response as JSON");
        throw new Error("AI returned invalid JSON for cover letter");
      }

      return validateAndNormalizeCoverLetter(parsedRaw);
    };

    let content = await generateOnce();

    if (
      context.maxCharacters &&
      content.characterCount > context.maxCharacters
    ) {
      this.logger.warn(
        `[cover-letter] generated content (${content.characterCount} chars) exceeds maxCharacters (${context.maxCharacters}) — retrying once with stricter instruction`,
      );
      content = await generateOnce(
        `ATENÇÃO: a resposta anterior excedeu o limite. O corpo da carta DEVE ter no máximo ${context.maxCharacters} caracteres. Seja mais direto e conciso.`,
      );
    }

    if (containsEmDash(content.body)) {
      // Travessão entrega texto gerado por IA — nunca deixamos um vazar para
      // o usuário. Sem retry aqui: sanitiza direto e entrega.
      this.logger.warn(
        "[cover-letter] generated content contained em dash (—) — sanitized before returning",
      );
      const sanitizedBody = stripEmDash(content.body);
      content = { body: sanitizedBody, characterCount: sanitizedBody.length };
    }

    return content;
  }

  private buildUserPrompt(
    ctx: CoverLetterContext,
    extraInstruction?: string,
  ): string {
    const lines: string[] = [
      "Escreva o corpo de uma carta de apresentação com base nos seguintes dados:",
      "",
      "## IDIOMA",
      `Escreva inteiramente em: ${ctx.language}`,
      "",
      "## DADOS DA CANDIDATURA",
      `Cargo: ${ctx.jobTitle}`,
      `Empresa: ${ctx.companyName}`,
      "",
      "## ESTILO",
      STYLE_GUIDANCE[ctx.style],
    ];

    if (ctx.candidateName) {
      lines.push(
        "",
        "## CANDIDATO",
        `Nome do candidato (use exatamente este valor se for citar o nome — nunca um placeholder): ${ctx.candidateName}`,
      );
    } else {
      lines.push(
        "",
        "## CANDIDATO",
        "Nome do candidato não disponível — não use nenhum placeholder tipo '[Seu Nome]'; escreva a carta sem se referir ao próprio nome.",
      );
    }

    if (ctx.lengthMode === "custom" && ctx.maxCharacters) {
      lines.push(
        "",
        "## COMPRIMENTO",
        `A carta deve ter no máximo ${ctx.maxCharacters} caracteres.`,
      );
    } else {
      lines.push("", "## COMPRIMENTO", LENGTH_GUIDANCE[ctx.lengthMode]);
    }

    if (ctx.professionalSummary) {
      lines.push(
        "",
        "## RESUMO PROFISSIONAL DO CV ADAPTADO (não repita literalmente — use como contexto)",
        ctx.professionalSummary,
      );
    }

    if (ctx.highlightedSkills.length > 0) {
      lines.push(
        "",
        "## COMPETÊNCIAS JÁ DESTACADAS NO CV ADAPTADO (não repita como lista — o CV já cobre isso)",
        ctx.highlightedSkills.join(", "),
      );
    }

    if (ctx.remainingGaps.length > 0) {
      lines.push(
        "",
        "## GAPS QUE O CV ADAPTADO NÃO RESOLVEU (priorize reforçar estes pontos na carta, com o que for verdadeiro)",
        ...ctx.remainingGaps.map((g) => `- ${g}`),
      );
    }

    if (ctx.keywords.length > 0) {
      lines.push(
        "",
        "## PALAVRAS-CHAVE DA VAGA AUSENTES NO CV (mencionar apenas se houver base real no contexto)",
        ctx.keywords.join(", "),
      );
    }

    if (extraInstruction) {
      lines.push("", "## INSTRUÇÃO ADICIONAL", extraInstruction);
    }

    lines.push("", "Gere o corpo da carta agora:");
    return lines.join("\n");
  }

  private buildStub(ctx: CoverLetterContext): CoverLetterContent {
    const body = [
      `Escrevo para manifestar meu interesse na vaga de ${ctx.jobTitle} na ${ctx.companyName}.`,
      ctx.remainingGaps.length > 0
        ? `Gostaria de reforçar minha experiência relacionada a: ${ctx.remainingGaps.slice(0, 2).join(", ")}.`
        : "Acredito que minha trajetória se conecta diretamente com os desafios desta posição.",
      "Fico à disposição para conversarmos sobre como posso contribuir com o time.",
    ].join("\n\n");

    return { body, characterCount: body.length };
  }
}
