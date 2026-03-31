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
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CreateResumeDto } from "./dto/create-resume.dto";
import { UpdateResumeDto } from "./dto/update-resume.dto";
import { ResumesService } from "./resumes.service";

const resumesValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard)
@Controller("resumes")
export class ResumesController {
  constructor(
    @Inject(ResumesService) private readonly resumesService: ResumesService,
  ) {}

  @Post()
  create(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        ...resumesValidationPipe,
        expectedType: CreateResumeDto,
      }),
    )
    dto: CreateResumeDto,
  ) {
    return this.resumesService.create(user.id, dto);
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

  @Delete(":id")
  @HttpCode(200)
  remove(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    return this.resumesService.remove(user.id, id);
  }
}
