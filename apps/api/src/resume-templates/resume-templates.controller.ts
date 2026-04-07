import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreateResumeTemplateDto } from "./dto/create-resume-template.dto";
import { UpdateResumeTemplateDto } from "./dto/update-resume-template.dto";
import { ResumeTemplatesService } from "./resume-templates.service";

const resumeTemplatesValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@Controller("resume-templates")
export class ResumeTemplatesController {
  constructor(
    @Inject(ResumeTemplatesService)
    private readonly resumeTemplatesService: ResumeTemplatesService,
  ) {}

  @Get()
  listActive() {
    return this.resumeTemplatesService.listActive();
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/resume-templates")
export class AdminResumeTemplatesController {
  constructor(
    @Inject(ResumeTemplatesService)
    private readonly resumeTemplatesService: ResumeTemplatesService,
  ) {}

  @Get()
  list() {
    return this.resumeTemplatesService.list();
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...resumeTemplatesValidationOptions,
        expectedType: CreateResumeTemplateDto,
      }),
    )
    dto: CreateResumeTemplateDto,
  ) {
    return this.resumeTemplatesService.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...resumeTemplatesValidationOptions,
        expectedType: UpdateResumeTemplateDto,
      }),
    )
    dto: UpdateResumeTemplateDto,
  ) {
    return this.resumeTemplatesService.update(id, dto);
  }

  @Post(":id/toggle-status")
  @HttpCode(200)
  toggleStatus(@Param("id") id: string) {
    return this.resumeTemplatesService.toggleStatus(id);
  }

  @Post(":id/upload-preview")
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor("previewImage", {
      fileFilter: (_req, file, cb) => {
        if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Only PNG, JPEG or WebP images are allowed"), false);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPreview(
    @Param("id") id: string,
    @UploadedFile() file: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname: string;
    },
  ) {
    return this.resumeTemplatesService.uploadPreview(id, file);
  }

  @Post(":id/upload-file")
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Only PDF or DOCX files are allowed"), false);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Param("id") id: string,
    @UploadedFile() file: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname: string;
    },
  ) {
    return this.resumeTemplatesService.uploadFile(id, file);
  }
}
