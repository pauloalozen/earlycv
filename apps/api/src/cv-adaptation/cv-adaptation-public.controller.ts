import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";

import { CvAdaptationService } from "./cv-adaptation.service";
import type { FileUpload } from "./dto/create-cv-adaptation.dto";

@Controller("cv-adaptation")
export class CvAdaptationPublicController {
  constructor(
    @Inject(CvAdaptationService)
    private readonly cvAdaptationService: CvAdaptationService,
  ) {}

  @Post("analyze-guest")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Only PDF, DOC or DOCX files are allowed"), false);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  analyzeGuest(
    @Req() req: Request,
    @UploadedFile() file: FileUpload | undefined,
    @Body("jobDescriptionText") jobDescriptionText: string,
    @Body("masterCvText") masterCvText?: string,
    @Body("turnstileToken") turnstileToken?: string,
  ) {
    if (!jobDescriptionText?.trim()) {
      throw new BadRequestException("jobDescriptionText is required");
    }
    return this.cvAdaptationService.analyzeGuest(
      jobDescriptionText,
      file,
      masterCvText,
      turnstileToken,
      req.analysisContext,
    );
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
