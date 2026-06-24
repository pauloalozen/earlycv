import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import {
  extractTextFromCvFile,
  validateCvFileEnvelope,
} from "../common/cv-text-extractor";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CvAdaptationAiService } from "../cv-adaptation/cv-adaptation-ai.service";
import type { FileUpload } from "../cv-adaptation/dto/create-cv-adaptation.dto";
import type { CvAdaptationOutput } from "../cv-adaptation/dto/cv-adaptation-output.types";
import type { JobRequirementCoverage } from "../cv-adaptation/dto/job-requirement.types";

type AjusteRef = {
  id: string;
  titulo: string;
  categoria: "keywords_incluidas" | "texto_reescrito" | "ajuste_conteudo";
};

function cvAdaptationOutputToText(output: CvAdaptationOutput): string {
  const lines: string[] = [output.summary, ""];

  for (const section of output.sections ?? []) {
    if (section.sectionType === "header") {
      for (const item of section.items) {
        if (item.heading) lines.push(item.heading);
        for (const bullet of item.bullets ?? []) lines.push(bullet);
      }
      lines.push("");
      continue;
    }

    lines.push(section.title);
    for (const item of section.items) {
      const meta = [item.heading, item.subheading, item.dateRange]
        .filter(Boolean)
        .join(" | ");
      if (meta) lines.push(meta);
      for (const bullet of item.bullets ?? []) lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/cv-benchmark")
export class CvBenchmarkAdminController {
  constructor(
    @Inject(CvAdaptationAiService)
    private readonly aiService: CvAdaptationAiService,
  ) {}

  @Post("parse")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async parse(@UploadedFile() file: FileUpload | undefined) {
    if (!file) throw new BadRequestException("No file uploaded");
    validateCvFileEnvelope(file);
    const cvText = await extractTextFromCvFile(file);
    return { cvText };
  }

  @Post("analyze")
  async analyze(
    @Body()
    body: { cvText: string; jobText: string },
  ) {
    if (!body.cvText?.trim()) throw new BadRequestException("cvText required");
    if (!body.jobText?.trim())
      throw new BadRequestException("jobText required");

    const canonicalJobJson = { rawDescription: body.jobText };

    const result = await this.aiService.analyzeAndAdaptDirect({
      masterCvText: body.cvText,
      jobDescriptionText: body.jobText,
      canonicalJobJson,
    });

    return {
      analysisOutput: result.adaptedContentJson,
      canonicalJobJson,
      model: result.analysisModel,
      promptVersion: result.analysisPromptVersion,
    };
  }

  @Post("adapt")
  async adapt(
    @Body()
    body: {
      cvText: string;
      jobText: string;
      selectedKeywords: string[];
      requirements: JobRequirementCoverage[];
      ajustesConteudo: AjusteRef[];
      jobTitle?: string;
      companyName?: string;
    },
  ) {
    if (!body.cvText?.trim()) throw new BadRequestException("cvText required");
    if (!body.jobText?.trim())
      throw new BadRequestException("jobText required");

    const { output, audit } = await this.aiService.adaptWithAudit({
      masterCvText: body.cvText,
      jobDescriptionText: body.jobText,
      selectedKeywords: body.selectedKeywords ?? [],
      requirementCoverage: body.requirements ?? [],
      ajustesConteudo: body.ajustesConteudo ?? [],
      jobTitle: body.jobTitle,
      companyName: body.companyName,
    });

    const adaptedCvText = cvAdaptationOutputToText(output);

    return { adaptedCv: output, adaptedCvText, audit };
  }

  @Post("reanalyze")
  async reanalyze(
    @Body()
    body: {
      adaptedCvText: string;
      jobText: string;
      requirements: JobRequirementCoverage[];
      canonicalJobJson: unknown;
      existingKeywordRule?: {
        presentes: Array<{ kw: string; pontos: number }>;
        ausentes: Array<{ kw: string; pontos: number }>;
        possiveis: Array<{ kw: string; pontos: number }>;
      };
    },
  ) {
    if (!body.adaptedCvText?.trim())
      throw new BadRequestException("adaptedCvText required");
    if (!body.jobText?.trim())
      throw new BadRequestException("jobText required");

    const result = await this.aiService.analyzeAndAdaptDirect({
      masterCvText: body.adaptedCvText,
      jobDescriptionText: body.jobText,
      canonicalJobJson: body.canonicalJobJson ?? {
        rawDescription: body.jobText,
      },
      existingRequirements: body.requirements ?? [],
      existingKeywordRule: body.existingKeywordRule,
    });

    return {
      reanalysisOutput: result.adaptedContentJson,
      model: result.analysisModel,
    };
  }
}
