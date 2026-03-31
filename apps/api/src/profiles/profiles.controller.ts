import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfilesService } from "./profiles.service";

const profilesValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard)
@Controller("users/profile")
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profilesService: ProfilesService,
  ) {}

  @Get()
  getProfile(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.profilesService.getByUserId(user.id);
  }

  @Put()
  updateProfile(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        ...profilesValidationPipe,
        expectedType: UpdateProfileDto,
      }),
    )
    dto: UpdateProfileDto,
  ) {
    return this.profilesService.update(user.id, dto);
  }
}
