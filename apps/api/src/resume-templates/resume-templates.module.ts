import { Module } from "@nestjs/common";
import { createAiClientFromEnv } from "../common/ai-client-factory";

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
    {
      provide: "OPENAI_CLIENT",
      useFactory: () => createAiClientFromEnv(),
    },
  ],
  exports: [ResumeTemplateDocxService],
})
export class ResumeTemplatesModule {}
