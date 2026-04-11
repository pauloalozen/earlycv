import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { LocalAuthGuard } from "../common/local-auth.guard";
import type { AuthUser, SocialProfileInput } from "./auth.service";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResendVerificationCodeDto } from "./dto/resend-verification-code.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";

const authValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

type SocialAuthRequest = {
  oauthUser?: SocialProfileInput;
  user?: SocialProfileInput;
};

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  register(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: RegisterDto,
      }),
    )
    dto: RegisterDto,
  ) {
    return this.authService.register(dto);
  }

  @Post("login")
  @UseGuards(LocalAuthGuard)
  login(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: LoginDto,
      }),
    )
    dto: LoginDto,
    @Req() request: { user: { id: string } },
  ) {
    void dto;

    return this.authService.login(request.user);
  }

  @Post("refresh")
  refresh(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: RefreshDto,
      }),
    )
    dto: RefreshDto,
  ) {
    return this.authService.refresh(dto);
  }

  @Post("logout")
  logout(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: RefreshDto,
      }),
    )
    dto: RefreshDto,
  ) {
    return this.authService.logout(dto);
  }

  @Post("verify-email")
  @UseGuards(JwtAuthGuard)
  verifyEmail(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: VerifyEmailDto,
      }),
    )
    dto: VerifyEmailDto,
    @AuthenticatedUser() user: AuthUser,
  ) {
    return this.authService.verifyEmail(user.id, dto);
  }

  @Post("resend-verification-code")
  @UseGuards(JwtAuthGuard)
  resendVerificationCode(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: ResendVerificationCodeDto,
      }),
    )
    dto: ResendVerificationCodeDto,
    @AuthenticatedUser() user: AuthUser,
  ) {
    return this.authService.resendVerificationCode(user.id, dto);
  }

  @Post("forgot-password")
  forgotPassword(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: ForgotPasswordDto,
      }),
    )
    dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto);
  }

  @Post("reset-password")
  resetPassword(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: ResetPasswordDto,
      }),
    )
    dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }

  @Get("google/start")
  @UseGuards(AuthGuard("google"))
  googleStart() {}

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  googleCallback(@Req() request: SocialAuthRequest) {
    return this.authService.finishSocialLogin(this.getSocialProfile(request));
  }

  @Get("linkedin/start")
  @UseGuards(AuthGuard("linkedin"))
  linkedinStart() {}

  @Get("linkedin/callback")
  @UseGuards(AuthGuard("linkedin"))
  linkedinCallback(@Req() request: SocialAuthRequest) {
    return this.authService.finishSocialLogin(this.getSocialProfile(request));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  me(@AuthenticatedUser() user: AuthUser) {
    return user;
  }

  private getSocialProfile(request: SocialAuthRequest): SocialProfileInput {
    const socialProfile = request.user ?? request.oauthUser;

    if (!socialProfile) {
      throw new Error("missing social auth payload");
    }

    return socialProfile;
  }
}
