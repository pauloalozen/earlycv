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

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

const companiesValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard)
@Controller("companies")
export class CompaniesController {
  constructor(
    @Inject(CompaniesService)
    private readonly companiesService: CompaniesService,
  ) {}

  @Post()
  create(
    @Body(
      new ValidationPipe({
        ...companiesValidationOptions,
        expectedType: CreateCompanyDto,
      }),
    )
    dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(dto);
  }

  @Get()
  list() {
    return this.companiesService.list();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.companiesService.getById(id);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...companiesValidationOptions,
        expectedType: UpdateCompanyDto,
      }),
    )
    dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.companiesService.remove(id);
  }
}
