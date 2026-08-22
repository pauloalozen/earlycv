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
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { AuditStatus, AuditTier } from "./company-source-audit.service";
import { CompanySourceAuditService } from "./company-source-audit.service";

const VALID_STATUSES: AuditStatus[] = [
  "pending",
  "approved",
  "rejected",
  "applied",
];
const VALID_TIERS: AuditTier[] = ["confirmed", "high", "review"];
const VALID_DECISIONS = ["approved", "rejected"] as const;

function isAuditStatus(value: string | undefined): value is AuditStatus {
  return !!value && (VALID_STATUSES as string[]).includes(value);
}

function isAuditTier(value: string | undefined): value is AuditTier {
  return !!value && (VALID_TIERS as string[]).includes(value);
}

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/company-source-audit")
export class CompanySourceAuditController {
  constructor(
    @Inject(CompanySourceAuditService)
    private readonly service: CompanySourceAuditService,
  ) {}

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("tier") tier?: string,
    @Query("search") search?: string,
  ) {
    const [findings, counts] = await Promise.all([
      this.service.listFindings({
        status: isAuditStatus(status) ? status : undefined,
        tier: isAuditTier(tier) ? tier : undefined,
        search: search?.trim() || undefined,
      }),
      this.service.countByStatus(),
    ]);
    return { findings, counts };
  }

  @Post("run")
  @HttpCode(200)
  async run() {
    return this.service.runAudit();
  }

  @Post(":id/decide")
  @HttpCode(200)
  async decide(
    @Param("id") id: string,
    @Body("status") status: string | undefined,
    @Body("note") note: string | undefined,
  ) {
    if (
      !status ||
      !VALID_DECISIONS.includes(status as "approved" | "rejected")
    ) {
      throw new BadRequestException(
        `status must be one of: ${VALID_DECISIONS.join(", ")}`,
      );
    }
    return this.service.decide(id, {
      status: status as (typeof VALID_DECISIONS)[number],
      note,
    });
  }

  @Post("apply")
  @HttpCode(200)
  async apply(@Body("dryRun") dryRun: boolean | undefined) {
    return this.service.applyApproved({ dryRun: dryRun !== false });
  }
}
