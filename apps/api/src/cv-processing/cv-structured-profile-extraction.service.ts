// Núcleo de extração de IA compartilhado — plano, seção 5 ("o núcleo de
// chamada de IA vira um componente puro compartilhado por dois escritores
// durante a transição"). MasterCvCanonicalExtractionService (legado)
// permanece intocado nesta fase, com sua própria chamada inline a
// extractMasterCvCanonicalProfile; este serviço é o equivalente usado pelo
// caminho novo (CvProcessingWorker), sem duplicar a decisão de
// fornecedor/modelo (reaproveita ai-client-factory como qualquer outro
// serviço de IA do projeto).
import { Injectable, Optional } from "@nestjs/common";
import type OpenAI from "openai";

import {
  createAiClientFromEnv,
  getActiveAiSupplier,
  getAiModel,
} from "../common/ai-client-factory";
import { parseMasterCvCanonicalExtractionPayload } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.schema";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";

const OPERATION = "CV_STRUCTURED_PROFILE";

export type StructuredProfileExtractionInput = {
  text: string;
};

export type ExtractionClient = {
  extract(
    input: StructuredProfileExtractionInput,
  ): Promise<MasterCvCanonicalExtractionOutput>;
};

@Injectable()
export class CvStructuredProfileExtractionService implements ExtractionClient {
  private readonly aiClient: OpenAI;
  private readonly aiModel: string;

  constructor(@Optional() private readonly overrideClient?: ExtractionClient) {
    this.aiClient = createAiClientFromEnv(OPERATION);
    this.aiModel = getAiModel(OPERATION);
  }

  async extract(
    input: StructuredProfileExtractionInput,
  ): Promise<MasterCvCanonicalExtractionOutput> {
    if (this.overrideClient) {
      return this.overrideClient.extract(input);
    }

    const { extractMasterCvCanonicalProfile } = await import("@earlycv/ai");
    const { output } = await extractMasterCvCanonicalProfile(
      this.aiClient as never,
      this.aiModel,
      { masterCvText: input.text },
      getActiveAiSupplier(OPERATION),
    );
    return parseMasterCvCanonicalExtractionPayload(output);
  }
}
