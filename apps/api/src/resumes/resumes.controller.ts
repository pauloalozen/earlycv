import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { FileUpload } from "../cv-adaptation/dto/create-cv-adaptation.dto";
import { CreateResumeDto } from "./dto/create-resume.dto";
import { UpdateResumeDto } from "./dto/update-resume.dto";
import { ResumesService } from "./resumes.service";

const resumesValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const resumeFileFilter = (
  _req: unknown,
  file: { mimetype: string },
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
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
};

@UseGuards(JwtAuthGuard)
@Controller("resumes")
export class ResumesController {
  constructor(
    @Inject(ResumesService) private readonly resumesService: ResumesService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: resumeFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @UploadedFile() file: FileUpload | undefined,
    @Body(
      new ValidationPipe({
        ...resumesValidationPipe,
        expectedType: CreateResumeDto,
      }),
    )
    dto: CreateResumeDto,
  ) {
    return this.resumesService.create(user.id, dto, file);
  }

  @Get()
  list(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.resumesService.list(user.id);
  }

  @Get(":id")
  getById(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    return this.resumesService.getById(user.id, id);
  }

  @Put(":id")
  update(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...resumesValidationPipe,
        expectedType: UpdateResumeDto,
      }),
    )
    dto: UpdateResumeDto,
  ) {
    return this.resumesService.update(user.id, id, dto);
  }

  @Post(":id/set-primary")
  @HttpCode(200)
  setPrimary(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    return this.resumesService.setPrimary(user.id, id);
  }

  @Get(":id/download")
  async download(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.resumesService.download(user.id, id, res);
  }

  @Delete(":id")
  @HttpCode(200)
  remove(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    return this.resumesService.remove(user.id, id);
  }
}
