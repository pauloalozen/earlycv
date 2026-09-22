import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { AnalysisConfigService } from "../analysis-protection/analysis-config.service";
import {
  ALLOWED_CV_FORMATS_LABEL,
  isAllowedCvUploadMimeType,
} from "../common/cv-file-formats";

import { CvAdaptationService } from "./cv-adaptation.service";
import type { FileUpload } from "./dto/create-cv-adaptation.dto";

@Controller("cv-adaptation")
export class CvAdaptationPublicController {
  constructor(
    @Inject(CvAdaptationService)
    private readonly cvAdaptationService: CvAdaptationService,
    @Inject(AnalysisConfigService)
    private readonly analysisConfig: AnalysisConfigService,
  ) {}

  @Post("analyze-guest")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (_req, file, cb) => {
        if (isAllowedCvUploadMimeType(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(`Only ${ALLOWED_CV_FORMATS_LABEL} files are allowed`),
            false,
          );
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  analyzeGuest(
    @Req() req: Request,
    @UploadedFile() file: FileUpload | undefined,
    @Body("jobDescriptionText") jobDescriptionText?: string,
    @Body("masterCvText") masterCvText?: string,
    @Body("turnstileToken") turnstileToken?: string,
    @Body("radarJobId") radarJobId?: string,
  ) {
    // Simetria com AnalyzeCvDto (endpoint autenticado /cv-adaptation/analyze):
    // radarJobId sozinho já é aceito lá porque resolveAnalysisJobDescription
    // resolve o texto a partir de Job.descriptionClean quando jobDescriptionText
    // não vem preenchido. Este guard aqui exigia jobDescriptionText mesmo com
    // radarJobId presente — startGuestAnalysisJob já suportava o caso (mesma
    // chamada a resolveAnalysisJobDescription), então o guard só bloqueava um
    // caminho que o resto do pipeline já sabia processar. Necessário para o
    // fluxo de 1 clique a partir de /radar/[slug] (Fase 1 de conversão do
    // Radar): a página não pede/envia descrição da vaga, só radarJobId.
    if (!jobDescriptionText?.trim() && !radarJobId?.trim()) {
      throw new BadRequestException(
        "jobDescriptionText or radarJobId is required",
      );
    }
    return this.cvAdaptationService.startGuestAnalysisJob(
      jobDescriptionText ?? "",
      file,
      masterCvText,
      turnstileToken,
      req.analysisContext,
      radarJobId,
    );
  }

  @Get("analysis-jobs/:jobId")
  async getAnalysisJobStatus(
    @Req() req: Request,
    @Param("jobId") jobId: string,
    @Headers("x-guest-possession-token") guestPossessionToken?: string,
  ) {
    const userId = req.analysisContext?.userId ?? null;

    if (!userId) {
      const { value: gateEnabled } = await this.analysisConfig.getBoolean(
        "guest_analysis_auth_gate_enabled",
      );

      if (gateEnabled) {
        return this.cvAdaptationService.getGuestAnalysisJobStatusOnly(
          jobId,
          guestPossessionToken ?? null,
        );
      }
    }

    return this.cvAdaptationService.getAnalysisJobStatus(jobId, {
      userId,
      sessionPublicToken: req.analysisContext?.sessionPublicToken ?? null,
    });
  }

  // Fase 1 de conversão do Radar (/radar/[slug]) — preview limitado da
  // análise guest, deliberadamente independente de
  // guest_analysis_auth_gate_enabled (essa flag só decide se o guest recebe
  // o adaptedContentJson completo em getAnalysisJobStatus; este endpoint
  // nunca devolve isso, então não há necessidade de fazer a flag também
  // controlar este preview mais estreito, nem de mudar a semântica dela pra
  // landing). Mesmo padrão de posse do getAnalysisJobStatus (header
  // x-guest-possession-token) — nunca aceita jobId "solto".
  @Get("analysis-jobs/:jobId/radar-preview")
  async getRadarAnalysisPreview(
    @Param("jobId") jobId: string,
    @Headers("x-guest-possession-token") guestPossessionToken?: string,
  ) {
    return this.cvAdaptationService.getGuestAnalysisRadarPreview(
      jobId,
      guestPossessionToken ?? null,
    );
  }

  // Único ponto de leitura do flag pelo frontend (ADENDO-hardening.md
  // seção 8.2) — o backend continua a autoridade final em todo endpoint
  // que importa (analyze-guest/analysis-jobs/:jobId/claim já leem a
  // config por conta própria); isto só existe para o frontend decidir
  // qual UI mostrar. Leitura fresca a cada chamada (cache de 5s do
  // AnalysisConfigService já existente) — nunca cacheado em build-time.
  @Get("config/public")
  async publicConfig() {
    const { value: guestAnalysisAuthGateEnabled } =
      await this.analysisConfig.getBoolean("guest_analysis_auth_gate_enabled");

    return { guestAnalysisAuthGateEnabled };
  }

  @Get("job-count")
  async jobCount(
    @Query("jobTitle") jobTitle?: string,
    @Query("companyName") companyName?: string,
  ) {
    const count = await this.cvAdaptationService.countByJob(
      jobTitle ?? null,
      companyName ?? null,
    );
    return { count };
  }
}
