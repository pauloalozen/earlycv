import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  type AnalysisConfigBackofficeEntry,
  AnalysisConfigBackofficeService,
} from "./analysis-config-backoffice.service";
import {
  ANALYSIS_CONFIG_SCHEMA,
  type AnalysisConfigKey,
} from "./config/analysis-config.schema";
import { UpdateAnalysisConfigDto } from "./dto/update-analysis-config.dto";

const configValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/analysis-protection/config")
export class AnalysisConfigController {
  constructor(
    @Inject(AnalysisConfigBackofficeService)
    private readonly analysisConfigBackofficeService: AnalysisConfigBackofficeService,
  ) {}

  @Get()
  async list(): Promise<{ entries: AnalysisConfigBackofficeEntry[] }> {
    const entries =
      await this.analysisConfigBackofficeService.getBackofficeEntries();

    return { entries };
  }

  @Patch(":key")
  async update(
    @Param("key") key: string,
    @Body(
      new ValidationPipe({
        ...configValidationOptions,
        expectedType: UpdateAnalysisConfigDto,
      }),
    )
    dto: UpdateAnalysisConfigDto,
    @AuthenticatedUser() actor: AuthenticatedRequestUser,
  ): Promise<{ entry: AnalysisConfigBackofficeEntry }> {
    this.assertValidConfigKey(key);
    const source = dto.source?.trim() || "ui/backoffice";
    const entry = await this.analysisConfigBackofficeService.setFromBackoffice({
      actor: {
        id: actor.id,
        role: actor.internalRole,
      },
      key,
      source,
      technicalContext: dto.technicalContext,
      value: dto.value,
    });

    return { entry };
  }

  private assertValidConfigKey(key: string): asserts key is AnalysisConfigKey {
    if (!(key in ANALYSIS_CONFIG_SCHEMA)) {
      throw new BadRequestException(`Unknown analysis config key: ${key}`);
    }
  }
}
