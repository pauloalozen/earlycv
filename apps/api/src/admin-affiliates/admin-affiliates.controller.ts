import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminAffiliatesService } from "./admin-affiliates.service";
import { UpsertAffiliateCampaignDto } from "./dto/upsert-affiliate-campaign.dto";
import { UpsertAffiliateCodeDto } from "./dto/upsert-affiliate-code.dto";
import { UpsertAffiliatePartnerDto } from "./dto/upsert-affiliate-partner.dto";

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/affiliates")
export class AdminAffiliatesController {
  constructor(
    @Inject(AdminAffiliatesService)
    private readonly service: AdminAffiliatesService,
  ) {}

  @Get("partners")
  listPartners() {
    return this.service.listPartners();
  }

  @Post("partners")
  createPartner(
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpsertAffiliatePartnerDto,
      }),
    )
    dto: UpsertAffiliatePartnerDto,
  ) {
    return this.service.createPartner(dto);
  }

  @Patch("partners/:id")
  updatePartner(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpsertAffiliatePartnerDto,
      }),
    )
    dto: UpsertAffiliatePartnerDto,
  ) {
    return this.service.updatePartner(id, dto);
  }

  @Patch("partners/:id/status")
  setPartnerStatus(
    @Param("id") id: string,
    @Body("status") status: "draft" | "active" | "inactive",
  ) {
    return this.service.setPartnerStatus(id, status);
  }

  @Get("campaigns")
  listCampaigns(@Query("partnerId") partnerId?: string) {
    return this.service.listCampaigns(partnerId);
  }

  @Post("campaigns")
  createCampaign(
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpsertAffiliateCampaignDto,
      }),
    )
    dto: UpsertAffiliateCampaignDto,
  ) {
    return this.service.createCampaign(dto);
  }

  @Patch("campaigns/:id")
  updateCampaign(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpsertAffiliateCampaignDto,
      }),
    )
    dto: UpsertAffiliateCampaignDto,
  ) {
    return this.service.updateCampaign(id, dto);
  }

  @Patch("campaigns/:id/status")
  setCampaignStatus(
    @Param("id") id: string,
    @Body("status") status: "draft" | "active" | "inactive",
  ) {
    return this.service.setCampaignStatus(id, status);
  }

  @Get("campaigns/:id/report")
  getCampaignReport(@Param("id") id: string) {
    return this.service.getCampaignReport(id);
  }

  @Post("codes")
  createCode(
    @Body(
      new ValidationPipe({
        ...validationOptions,
        expectedType: UpsertAffiliateCodeDto,
      }),
    )
    dto: UpsertAffiliateCodeDto,
  ) {
    return this.service.createCode(dto);
  }

  @Patch("codes/:id/status")
  setCodeStatus(
    @Param("id") id: string,
    @Body("status") status: "draft" | "active" | "inactive",
  ) {
    return this.service.setCodeStatus(id, status);
  }
}
