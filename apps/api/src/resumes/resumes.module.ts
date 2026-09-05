import { Module } from "@nestjs/common";

import { CvProcessingModule } from "../cv-processing/cv-processing.module";
import { DatabaseModule } from "../database/database.module";
import { MasterCvCanonicalExtractionModule } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { ResumesController } from "./resumes.controller";
import { ResumesService } from "./resumes.service";

@Module({
  imports: [
    DatabaseModule,
    ProfilesModule,
    // Fase 2G — achado crítico: este import nunca existiu, desde a Fase 2A.
    // ResumesService injeta CvProcessingEntrypointService com @Optional(),
    // e sem este import o Nest resolve a dependência para `undefined` (não
    // lança erro — @Optional() silencia a ausência do provider no escopo
    // visível do módulo). Efeito real, em produção, com a flag LIGADA:
    // resumes.service.ts#create SEMPRE caía no branch `else` (legado),
    // porque `this.cvProcessingEntrypoint` era sempre undefined — a flag
    // nunca teve efeito nenhum neste entrypoint em nenhum ambiente real
    // (só nos testes unitários, que instanciam ResumesService diretamente
    // com mocks, nunca passando pelo módulo). Sem este import, a
    // integração de set-primary desta fase (que também depende de
    // CvProcessingEntrypointService + CvMasterPromotionService) teria o
    // mesmo problema.
    CvProcessingModule,
    ...(process.env.MASTER_CV_CANONICAL_EXTRACTION_ENABLED === "true"
      ? [MasterCvCanonicalExtractionModule]
      : []),
  ],
  controllers: [ResumesController],
  providers: [ResumesService],
})
export class ResumesModule {}
