import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

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
}
