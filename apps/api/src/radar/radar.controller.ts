import { Body, Controller, Get, Inject, Put, UseGuards, ValidationPipe } from "@nestjs/common";

import {
  AuthenticatedUser,
  type AuthenticatedRequestUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { UpdateRadarProfileDto } from "./dto/update-radar-profile.dto";
import { UserRadarProfileService } from "./user-radar-profile.service";

@UseGuards(JwtAuthGuard)
@Controller("radar/profile")
export class RadarController {
  constructor(
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
  ) {}

  @Get()
  getProfile(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.userRadarProfileService.getProfile(user.id);
  }

  @Put()
  updateProfile(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true, expectedType: UpdateRadarProfileDto }))
    dto: UpdateRadarProfileDto,
  ) {
    return this.userRadarProfileService.updateProfile(user.id, dto);
  }
}
