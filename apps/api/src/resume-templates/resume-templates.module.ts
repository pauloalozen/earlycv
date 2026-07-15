import { Module } from "@nestjs/common";
import OpenAI from "openai";

import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { ResumeTemplateDocxService } from "./resume-template-docx.service";
import { ResumeTemplateGeneratorService } from "./resume-template-generator.service";
import {
  AdminResumeTemplatesController,
  ResumeTemplatesController,
} from "./resume-templates.controller";
import { ResumeTemplatesService } from "./resume-templates.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ResumeTemplatesController, AdminResumeTemplatesController],
  providers: [
    ResumeTemplatesService,
    ResumeTemplateGeneratorService,
    ResumeTemplateDocxService,
    RolesGuard,
    // Client dedicado à OpenAI (não segue AI_SUPPLIER): ResumeTemplateGeneratorService
    // usa vision com modelo gpt-4o fixo (ver comentário no service), então precisa
    // sempre falar com a OpenAI, independente do supplier ativo pro resto do produto.
    {
      provide: "OPENAI_CLIENT",
      useFactory: () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    },
  ],
  exports: [ResumeTemplateDocxService],
})
export class ResumeTemplatesModule {}
