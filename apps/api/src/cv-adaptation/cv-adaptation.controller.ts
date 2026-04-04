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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CvAdaptationService } from "./cv-adaptation.service";
import {
  CreateCvAdaptationDto,
  type FileUpload,
} from "./dto/create-cv-adaptation.dto";

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
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === "application/pdf") {
          cb(null, true);
        } else {
          cb(new Error("Only PDF files are allowed"), false);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    }),
  )
  create(
    @CurrentUser() user: { id: string },
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

  @Get()
  list(
    @CurrentUser() user: { id: string },
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
  getById(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.cvAdaptationService.getById(user.id, id);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.cvAdaptationService.delete(user.id, id);
  }
}
