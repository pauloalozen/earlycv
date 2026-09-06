import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { getAiModel } from "../common/ai-client-factory";
import { CvStructuredProfileExtractionService } from "./cv-structured-profile-extraction.service";

// Bug real auditado nesta sessão: CvStructuredProfileExtractionService usava
// um identificador de operação inventado ("CV_STRUCTURED_PROFILE"), que
// nunca correspondia a nenhuma AI_SUPPLIER_* configurada — caindo
// silenciosamente no fallback genérico AI_SUPPLIER (openai|gpt-5.4-mini) em
// vez de AI_SUPPLIER_MASTERCV (deepseek|deepseek-v4-flash), a mesma variável
// já usada pelo escritor legado (MasterCvCanonicalExtractionService). Estes
// testes provam a correção (OPERATION = "MASTERCV") e travam a regressão.

const ENV_KEYS = [
  "AI_SUPPLIER",
  "AI_SUPPLIER_MASTERCV",
  "AI_SUPPLIER_ANALYSIS",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

function readInternalAiConfig(service: CvStructuredProfileExtractionService) {
  // Campos são `private` só em tempo de compilação (TS), não em runtime —
  // acesso direto é o jeito mais fiel de provar o que o serviço REALMENTE
  // resolveu, sem duplicar a lógica de resolveAiConfig num mock paralelo.
  const internal = service as unknown as {
    aiModel: string;
    aiClient: { baseURL?: string };
  };
  return { model: internal.aiModel, baseURL: internal.aiClient.baseURL };
}

test("AI_SUPPLIER_MASTERCV tem precedência sobre AI_SUPPLIER na extração canônica (CvProcessingWorker)", () => {
  process.env.AI_SUPPLIER = "openai|gpt-5.4-mini";
  process.env.AI_SUPPLIER_MASTERCV = "deepseek|deepseek-v4-flash";
  process.env.DEEPSEEK_API_KEY = "fake-deepseek-key";

  const service = new CvStructuredProfileExtractionService();
  const { model, baseURL } = readInternalAiConfig(service);

  assert.equal(
    model,
    "deepseek-v4-flash",
    "extração canônica deveria resolver o modelo de AI_SUPPLIER_MASTERCV, não do AI_SUPPLIER genérico",
  );
  assert.equal(
    baseURL,
    "https://api.deepseek.com",
    "extração canônica deveria apontar pro endpoint do DeepSeek, não da OpenAI",
  );
});

test("fallback genérico (AI_SUPPLIER) só é usado quando AI_SUPPLIER_MASTERCV está ausente", () => {
  process.env.AI_SUPPLIER = "openai|gpt-5.4-mini";
  process.env.OPENAI_API_KEY = "fake-openai-key";
  // AI_SUPPLIER_MASTERCV intencionalmente ausente.

  const service = new CvStructuredProfileExtractionService();
  const { model } = readInternalAiConfig(service);

  assert.equal(
    model,
    "gpt-5.4-mini",
    "sem AI_SUPPLIER_MASTERCV configurada, é esperado (e correto) cair no fallback genérico",
  );
});

test("CvProcessingWorker (via CvStructuredProfileExtractionService) e o fluxo legado (MasterCvCanonicalExtractionService) resolvem o MESMO fornecedor para extração", () => {
  process.env.AI_SUPPLIER = "openai|gpt-5.4-mini";
  process.env.AI_SUPPLIER_MASTERCV = "deepseek|deepseek-v4-flash";
  process.env.DEEPSEEK_API_KEY = "fake-deepseek-key";

  const service = new CvStructuredProfileExtractionService();
  const { model: newPipelineModel } = readInternalAiConfig(service);

  // O escritor legado (master-cv-canonical-extraction.service.ts) resolve
  // literalmente via getAiModel("MASTERCV") — mesma chave, mesma função.
  const legacyModel = getAiModel("MASTERCV");

  assert.equal(
    newPipelineModel,
    legacyModel,
    "o pipeline novo e o legado precisam concordar sobre qual modelo usar pra extração — nunca dois fornecedores diferentes pra mesma operação de negócio",
  );
  assert.equal(newPipelineModel, "deepseek-v4-flash");
});

test("análise CV × vaga resolve AI_SUPPLIER_ANALYSIS com precedência sobre AI_SUPPLIER (mesma chave usada pelo legado e pelo pipeline canônico, via CvAdaptationAiService compartilhado)", () => {
  process.env.AI_SUPPLIER = "openai|gpt-5.4-mini";
  process.env.AI_SUPPLIER_ANALYSIS = "deepseek|deepseek-v4-flash";

  // CvAnalysisWorker (pipeline novo) e o dispatch legado chamam o MESMO
  // CvAdaptationProtectedAnalyzeService/CvAdaptationAiService#getAiModel
  // ("ANALYSIS") — não existe uma segunda resolução paralela pra análise
  // (diferente do bug da extração canônica, que tinha um serviço próprio
  // com identificador errado). Esta asserção prova que a chave "ANALYSIS"
  // continua resolvendo deepseek independente de qual caminho chamou.
  assert.equal(getAiModel("ANALYSIS"), "deepseek-v4-flash");
});

test("nenhuma chave de API ou conteúdo do CV aparece na mensagem de erro logada em falha de extração", async () => {
  process.env.AI_SUPPLIER_MASTERCV = "deepseek|deepseek-v4-flash";
  process.env.DEEPSEEK_API_KEY = "super-secret-deepseek-key-abc123";

  const cvText =
    "Fulano de Tal, fulano.confidencial@example.com, +55 11 91234-5678, experiência sensível X";

  const overrideClient = {
    extract: async () => {
      // Simula um erro real de SDK de IA — nunca deveria ecoar o payload
      // de entrada nem a chave na mensagem.
      throw new Error("401 Incorrect API key provided: sk-***");
    },
  };

  const service = new CvStructuredProfileExtractionService(overrideClient);

  // O contrato do serviço é: a mensagem de erro propagada nunca inclui o
  // texto do CV (ela só carrega o que o SDK de IA já retornou, nunca o
  // input original é re-serializado dentro do erro).
  let caught: unknown;
  try {
    await service.extract({ text: cvText });
    assert.fail("esperava que a extração rejeitasse com o erro simulado");
  } catch (error) {
    caught = error;
  }

  const message = caught instanceof Error ? caught.message : String(caught);
  assert.ok(
    !message.includes(cvText),
    "mensagem de erro nunca deve conter o texto bruto do CV",
  );
  assert.ok(
    !message.includes(process.env.DEEPSEEK_API_KEY as string),
    "mensagem de erro nunca deve conter a chave de API real",
  );
});
