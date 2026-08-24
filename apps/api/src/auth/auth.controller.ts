import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Redirect,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { LocalAuthGuard } from "../common/local-auth.guard";
import type { AuthUser, SocialProfileInput } from "./auth.service";
import { AuthService } from "./auth.service";
import { CreateOAuthAttemptDto } from "./dto/create-oauth-attempt.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResendVerificationCodeDto } from "./dto/resend-verification-code.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { GoogleOAuthStartGuard } from "./guards/google-oauth-start.guard";
import { OAuthAttemptService } from "./oauth-attempt.service";
import {
  readAndClearOAuthJourneySessionId,
  readAndClearOAuthSignupContext,
  readAndClearOAuthVisitorId,
} from "./oauth-signup-context";

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
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(OAuthAttemptService)
    private readonly oauthAttemptService: OAuthAttemptService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("oauth-attempts")
  createOAuthAttempt(
    @Body(
      new ValidationPipe({
        ...authValidationPipe,
        expectedType: CreateOAuthAttemptDto,
      }),
    )
    dto: CreateOAuthAttemptDto,
  ) {
    return this.oauthAttemptService.create(dto);
  }

  @Throttle({ default: { ttl: 600_000, limit: 5 } })
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

  @Throttle({ default: { ttl: 300_000, limit: 10 } })
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
    return this.authService.login(
      request.user,
      dto.sessionInternalId,
      dto.visitorId,
    );
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

  @Throttle({ default: { ttl: 600_000, limit: 3 } })
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

  @Throttle({ default: { ttl: 600_000, limit: 5 } })
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

  @SkipThrottle()
  @Get("google/start")
  @UseGuards(GoogleOAuthStartGuard)
  googleStart() {}

  @SkipThrottle()
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  @Redirect()
  async googleCallback(
    @Req() request: SocialAuthRequest & Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const conversionContext = readAndClearOAuthSignupContext(request, response);
    const sessionInternalId = readAndClearOAuthJourneySessionId(
      request,
      response,
    );
    const visitorId = readAndClearOAuthVisitorId(request, response);

    const tokens = await this.authService.finishSocialLogin(
      this.getSocialProfile(request),
      conversionContext,
      sessionInternalId,
      visitorId,
    );

    // state (se presente) é resolvido e consumido de forma atômica aqui —
    // nunca antes do login em si, e nunca condiciona se o login acontece.
    // Um state ausente/expirado/já consumido/inexistente só significa "esta
    // ida ao Google não nasceu de uma análise guest pendente (ou o vínculo
    // já morreu)" — nunca quebra o fluxo de autenticação. A associação
    // real da análise ao usuário (claim) é Fase 4; aqui só repassamos o
    // analysisJobId resolvido adiante, via query — não é segredo (o
    // guestPossessionToken, que era o segredo, já foi gasto no passo
    // anterior, em POST /auth/oauth-attempts).
    const state =
      typeof request.query?.state === "string" ? request.query.state : null;
    const resolvedAttempt = state
      ? await this.oauthAttemptService.resolveAndConsume(state)
      : null;

    return this.buildSocialRedirect(tokens, resolvedAttempt?.analysisJobId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  me(@AuthenticatedUser() user: AuthUser) {
    return user;
  }

  @Delete("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  deleteMe(@AuthenticatedUser() user: AuthUser) {
    return this.authService.deleteCurrentUser(user.id);
  }

  private buildSocialRedirect(
    tokens: {
      accessToken: string;
      refreshToken: string;
    },
    analysisJobId?: string | null,
  ) {
    const base = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    if (analysisJobId) {
      params.set("analysisJobId", analysisJobId);
    }
    return { url: `${base}/auth/social-callback?${params.toString()}` };
  }

  private getSocialProfile(request: SocialAuthRequest): SocialProfileInput {
    const socialProfile = request.user ?? request.oauthUser;

    if (!socialProfile) {
      throw new Error("missing social auth payload");
    }

    return socialProfile;
  }
}
