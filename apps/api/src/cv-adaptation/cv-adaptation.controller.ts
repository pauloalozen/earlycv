import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CvAdaptationService } from "./cv-adaptation.service";
import { AnalyzeCvDto } from "./dto/analyze-cv.dto";
import { ClaimGuestAdaptationDto } from "./dto/claim-guest-adaptation.dto";
import {
  CreateCvAdaptationDto,
  type FileUpload,
} from "./dto/create-cv-adaptation.dto";
import { SaveGuestPreviewDto } from "./dto/save-guest-preview.dto";

const claimGuestValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  expectedType: ClaimGuestAdaptationDto,
});

@Controller("cv-adaptation")
@UseGuards(JwtAuthGuard)
export class CvAdaptationController {
  constructor(
    @Inject(CvAdaptationService)
    private readonly cvAdaptationService: CvAdaptationService,
  ) {}

  @Post()
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
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    }),
  )
  create(
    @AuthenticatedUser() user: { id: string },
    @UploadedFile() file: FileUpload | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: CreateCvAdaptationDto,
      }),
    )
    dto: CreateCvAdaptationDto,
  ) {
    return this.cvAdaptationService.create(user.id, dto, file);
  }

  @Post("claim-guest")
  claimGuest(
    @AuthenticatedUser() user: { id: string },
    @Body(claimGuestValidationPipe)
    dto: ClaimGuestAdaptationDto,
  ) {
    return this.cvAdaptationService.claimGuest(user.id, dto);
  }

  @Post("analyze")
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
  analyzeAuthenticated(
    @AuthenticatedUser() user: { id: string },
    @UploadedFile() file: FileUpload | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: AnalyzeCvDto,
      }),
    )
    dto: AnalyzeCvDto,
  ) {
    return this.cvAdaptationService.analyzeAuthenticated(user.id, dto, file);
  }

  @Post("save-guest-preview")
  saveGuestPreview(
    @AuthenticatedUser() user: { id: string },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: SaveGuestPreviewDto,
      }),
    )
    dto: SaveGuestPreviewDto,
  ) {
    return this.cvAdaptationService.saveGuestPreview(user.id, dto);
  }

  @Get()
  list(
    @AuthenticatedUser() user: { id: string },
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.cvAdaptationService.list(
      user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(":id")
  getById(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.cvAdaptationService.getById(user.id, id);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.cvAdaptationService.delete(user.id, id);
  }

  @Post(":id/checkout")
  checkout(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.cvAdaptationService.createCheckout(user.id, id);
  }

  @Post(":id/confirm-payment")
  confirmPayment(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
  ) {
    return this.cvAdaptationService.confirmPayment(user.id, id);
  }

  @Post(":id/redeem-credit")
  redeemWithCredit(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
  ) {
    return this.cvAdaptationService.redeemWithCredit(user.id, id);
  }

  @Get(":id/download")
  async download(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
    @Query("format") format = "pdf",
    @Res() res: Response,
  ) {
    if (format === "docx") {
      return this.cvAdaptationService.downloadDocx(user.id, id, res);
    }
    return this.cvAdaptationService.downloadPdf(user.id, id, res);
  }

  @Get(":id/content")
  getContent(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
  ) {
    return this.cvAdaptationService.getContent(user.id, id);
  }

  @Post("webhook/:provider")
  webhook(@Param("provider") provider: string, @Body() body: unknown) {
    return this.cvAdaptationService.handleWebhook(provider, body);
  }
}
