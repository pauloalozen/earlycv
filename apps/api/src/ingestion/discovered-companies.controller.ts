import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { DiscoveredCompanyStatus } from "@prisma/client";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { DiscoveredCompaniesService } from "./discovered-companies.service";

const VALID_STATUSES: DiscoveredCompanyStatus[] = [
  "PENDING",
  "VALIDATED",
  "NO_ACTIVE_JOBS",
  "NO_TECH_JOBS",
  "INVALID",
  "IMPORTED",
  "DISMISSED",
];

function isDiscoveredCompanyStatus(
  value: string,
): value is DiscoveredCompanyStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/discovery")
export class DiscoveredCompaniesController {
  constructor(
    @Inject(DiscoveredCompaniesService)
    private readonly discoveredCompaniesService: DiscoveredCompaniesService,
  ) {}

  @Get()
  list(@Query("status") statusParam?: string) {
    const status = statusParam
      ?.split(",")
      .map((value) => value.trim())
      .filter(isDiscoveredCompanyStatus);
    return this.discoveredCompaniesService.list(status);
  }

  @Post("import")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file"))
  import(
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
    @Body("csvText") csvText: string | undefined,
  ) {
    const text = file?.buffer ? file.buffer.toString("utf8") : csvText;
    if (!text) {
      throw new BadRequestException("file or csvText is required");
    }

    return this.discoveredCompaniesService.importCandidatesCsv({
      batchLabel: file?.originalname,
      csvText: text,
    });
  }

  @Post("validate")
  @HttpCode(200)
  validate(@Query("maxProbes") maxProbesParam?: string) {
    const maxProbes = maxProbesParam
      ? Number.parseInt(maxProbesParam, 10)
      : undefined;
    return this.discoveredCompaniesService.validatePending(
      Number.isFinite(maxProbes) ? maxProbes : undefined,
    );
  }

  @Post(":id/validate")
  @HttpCode(200)
  validateOne(@Param("id") id: string) {
    return this.discoveredCompaniesService.validateOne(id);
  }

  @Post(":id/promote")
  @HttpCode(200)
  promote(@Param("id") id: string) {
    return this.discoveredCompaniesService.promote(id);
  }

  @Post("promote-all")
  @HttpCode(200)
  promoteAll() {
    return this.discoveredCompaniesService.promoteAll();
  }

  @Post(":id/promote-manual")
  @HttpCode(200)
  promoteManual(
    @Param("id") id: string,
    @Body("careersUrl") careersUrl: string | undefined,
    @Body("adapterType") adapterType: string | undefined,
  ) {
    if (!careersUrl || !adapterType) {
      throw new BadRequestException("careersUrl and adapterType are required");
    }
    return this.discoveredCompaniesService.promoteManual(id, {
      adapterType,
      careersUrl,
    });
  }

  @Post(":id/dismiss")
  @HttpCode(200)
  dismiss(@Param("id") id: string) {
    return this.discoveredCompaniesService.dismiss(id);
  }
}
