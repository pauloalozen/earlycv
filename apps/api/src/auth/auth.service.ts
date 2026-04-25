import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, type UserStatus } from "@prisma/client";
import * as argon2 from "argon2";

import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import type { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RefreshDto } from "./dto/refresh.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { ResendVerificationCodeDto } from "./dto/resend-verification-code.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { VerifyEmailDto } from "./dto/verify-email.dto";
import {
  EMAIL_DELIVERY_PORT,
  type EmailDeliveryPort,
} from "./email-delivery.port";

type PersistedUser = Awaited<ReturnType<DatabaseService["user"]["findUnique"]>>;
type UserRecord = NonNullable<PersistedUser>;

export type AuthInternalRole = "none" | "admin" | "superadmin";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  planType: string;
  status: string;
  isStaff: boolean;
  internalRole: AuthInternalRole;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type SocialProvider = "google" | "linkedin";

export type SocialProfileInput = {
  provider: SocialProvider;
  providerAccountId: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  type: "access";
};

type RefreshTokenPayload = {
  sub: string;
  sessionId: string;
  type: "refresh";
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(EMAIL_DELIVERY_PORT)
    private readonly emailDelivery: EmailDeliveryPort,
  ) {}

  async register(input: RegisterDto): Promise<AuthSession> {
    const user = await this.createUser({
      email: input.email,
      password: input.password,
      name: input.name,
    });

    await this.issueEmailVerificationChallenge(user.id, user.email);

    return this.issueSession(user.id);
  }

  async createStaffUser(input: CreateStaffUserDto): Promise<AuthUser> {
    const user = await this.createUser({
      email: input.email,
      password: input.password,
      name: input.name,
      isStaff: true,
      internalRole: input.internalRole,
      status: "active",
    });

    return this.sanitizeUser(user);
  }

  async validateCredentials(input: LoginDto) {
    const user = await this.database.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });

    if (
      !user?.passwordHash ||
      user.status !== "active" ||
      !(await argon2.verify(user.passwordHash, input.password))
    ) {
      throw new UnauthorizedException("invalid credentials");
    }

    return user;
  }

  async login(user: { id: string }): Promise<AuthSession> {
    return this.issueSession(user.id);
  }

  async verifyEmail(userId: string, input: VerifyEmailDto): Promise<AuthUser> {
    const user = await this.requireUserById(userId);

    if (user.emailVerifiedAt) {
      return this.sanitizeUser(user);
    }

    const challenge = await this.loadLatestActiveVerificationChallenge(user.id);

    if (!challenge || challenge.expiresAt <= new Date()) {
      throw new BadRequestException("verification code is invalid or expired");
    }

    const matches = await argon2.verify(challenge.codeHash, input.code.trim());

    if (!matches) {
      throw new BadRequestException("verification code is invalid or expired");
    }

    const now = new Date();
    const verifiedUser = await this.database.$transaction(async (tx) => {
      await tx.emailVerificationChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });

      return tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
    });

    return this.sanitizeUser(verifiedUser);
  }

  async resendVerificationCode(
    userId: string,
    _input: ResendVerificationCodeDto,
  ) {
    const user = await this.requireUserById(userId);

    if (user.emailVerifiedAt) {
      throw new BadRequestException("email is already verified");
    }

    await this.issueEmailVerificationChallenge(user.id, user.email);

    return { ok: true } as const;
  }

  async finishSocialLogin(input: SocialProfileInput): Promise<AuthSession> {
    const providerEmail = input.email.trim().toLowerCase();
    const providerAccountId = input.providerAccountId.trim();

    if (!providerEmail || !providerAccountId || !input.emailVerified) {
      throw new UnauthorizedException("verified social email is required");
    }

    const now = new Date();
    const loadExistingSocialUser = async () => {
      const existingAccount = await this.database.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: input.provider,
            providerAccountId,
          },
        },
      });

      if (existingAccount) {
        return { userId: existingAccount.userId };
      }

      const existingUser = await this.database.user.findUnique({
        where: { email: providerEmail },
      });

      if (existingUser) {
        return { userId: existingUser.id };
      }

      return null;
    };

    let socialResult: { userId: string };

    try {
      socialResult = await this.database.$transaction(async (tx) => {
        const existingAccount = await tx.authAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: input.provider,
              providerAccountId,
            },
          },
        });

        if (existingAccount) {
          return { userId: existingAccount.userId };
        }

        const user = await tx.user.upsert({
          where: { email: providerEmail },
          update: {
            emailVerifiedAt: now,
            name: input.name.trim(),
            status: "active",
          },
          create: {
            email: providerEmail,
            name: input.name.trim(),
            status: "active",
            emailVerifiedAt: now,
            profile: { create: {} },
          },
        });

        const authAccount = await tx.authAccount.upsert({
          where: {
            provider_providerAccountId: {
              provider: input.provider,
              providerAccountId,
            },
          },
          update: {
            providerEmail,
            userId: user.id,
          },
          create: {
            userId: user.id,
            provider: input.provider,
            providerAccountId,
            providerEmail,
          },
        });

        return { userId: authAccount.userId };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      const recovered = await loadExistingSocialUser();

      if (!recovered) {
        throw error;
      }

      socialResult = recovered;
    }

    return this.issueSession(socialResult.userId);
  }

  async refresh(input: RefreshDto): Promise<AuthSession> {
    const userId = await this.rotateRefreshSession(input.refreshToken);

    return this.issueSession(userId);
  }

  async logout(input: RefreshDto) {
    await this.rotateRefreshSession(input.refreshToken);

    return { ok: true } as const;
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== "active") {
      throw new UnauthorizedException();
    }

    return this.sanitizeUser(user);
  }

  async forgotPassword(input: ForgotPasswordDto): Promise<{ ok: true }> {
    const user = await this.database.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });

    // Always return ok to avoid leaking whether the email exists
    if (!user || user.status !== "active") {
      return { ok: true };
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.database.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const resetLink = `${frontendUrl}/redefinir-senha?token=${rawToken}`;

    await this.emailDelivery.send({
      to: user.email,
      subject: "Redefinir sua senha — EarlyCV",
      text: `Você solicitou a redefinição de senha.\n\nClique no link abaixo para criar uma nova senha (válido por 1 hora):\n\n${resetLink}\n\nSe não foi você, ignore este email.`,
      html: `<p>Você solicitou a redefinição de senha.</p><p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p><p>O link expira em 1 hora.</p><p>Se não foi você, ignore este email.</p>`,
    });

    return { ok: true };
  }

  async resetPassword(input: ResetPasswordDto): Promise<{ ok: true }> {
    const tokenHash = createHash("sha256").update(input.token).digest("hex");

    const record = await this.database.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt !== null || record.expiresAt <= new Date()) {
      throw new BadRequestException(
        "Link de redefinição inválido ou expirado.",
      );
    }

    const passwordHash = await argon2.hash(input.newPassword);

    await this.database.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
    });

    return { ok: true };
  }

  private async createUser(input: {
    email: string;
    password: string;
    name: string;
    status?: UserStatus;
    isStaff?: boolean;
    internalRole?: Exclude<AuthInternalRole, "none">;
  }) {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.database.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("email is already registered");
    }

    const passwordHash = await argon2.hash(input.password);
    return this.database.user.create({
      data: {
        email,
        passwordHash,
        name: input.name.trim(),
        status: input.status ?? "active",
        isStaff: input.isStaff ?? false,
        internalRole: input.internalRole ?? "none",
        profile: { create: {} },
        authAccounts: {
          create: {
            provider: "credentials",
            providerAccountId: email,
            providerEmail: email,
          },
        },
      },
    });
  }

  private async issueSession(userId: string): Promise<AuthSession> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== "active") {
      throw new UnauthorizedException();
    }

    const sessionId = randomUUID();
    const accessTokenPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: "access",
    };
    const refreshTokenPayload: RefreshTokenPayload = {
      sub: user.id,
      sessionId,
      type: "refresh",
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        secret: this.env.JWT_ACCESS_SECRET,
        expiresIn: this.env.JWT_ACCESS_TTL,
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.env.JWT_REFRESH_SECRET,
        expiresIn: this.env.JWT_REFRESH_TTL,
      }),
    ]);
    const refreshTokenHash = await argon2.hash(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.env.JWT_REFRESH_TTL * 1000);

    await this.database.refreshToken.create({
      data: {
        userId: user.id,
        sessionId,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    const updatedUser = await this.database.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(updatedUser),
    };
  }

  private async issueEmailVerificationChallenge(userId: string, email: string) {
    const now = new Date();
    const code = this.generateVerificationCode();
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    await this.database.$transaction(async (tx) => {
      await tx.emailVerificationChallenge.updateMany({
        where: {
          userId,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });

      await tx.emailVerificationChallenge.create({
        data: {
          userId,
          codeHash,
          expiresAt,
        },
      });
    });

    const frontendUrl =
      process.env.FRONTEND_URL ??
      process.env.APP_URL ??
      "https://earlycv.com.br";
    const logoUrl = `${frontendUrl}/logo@2x.png`;

    await this.emailDelivery.send({
      to: email,
      subject: "Seu código de verificação EarlyCV",
      text: `Seu código de verificação é ${code}. Ele expira em 15 minutos.`,
      html: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verificação de e-mail</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <!-- Logo + badge -->
          <tr>
            <td style="padding-bottom:28px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <img src="${logoUrl}" alt="earlyCV" width="130" height="35" style="display:block;height:35px;width:auto;border:0;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:monospace;font-size:10px;color:#8a8a85;border:1px solid #d8d6ce;border-radius:3px;padding:2px 6px;font-weight:500;white-space:nowrap;">v1.2</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:40px 36px;border:1px solid rgba(10,10,10,0.07);">
              <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0a0a0a;letter-spacing:-0.4px;">Confirme seu e-mail</p>
              <p style="margin:0 0 28px;font-size:14px;color:#6a6a66;line-height:1.6;">Use o código abaixo para verificar sua conta. Ele expira em <strong>15 minutos</strong>.</p>
              <!-- OTP -->
              <div style="background:#f5f5f0;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0a0a0a;font-variant-numeric:tabular-nums;">${code}</span>
              </div>
              <p style="margin:0;font-size:12px;color:#8a8a85;line-height:1.6;">Se você não solicitou esse código, pode ignorar este e-mail com segurança.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#8a8a85;">© earlyCV · 2026 · <a href="mailto:contato@earlycv.com.br" style="color:#8a8a85;text-decoration:none;">contato@earlycv.com.br</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  }

  private generateVerificationCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private async loadLatestActiveVerificationChallenge(userId: string) {
    return this.database.emailVerificationChallenge.findFirst({
      where: {
        userId,
        consumedAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  private async requireUserById(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("user not found");
    }

    return user;
  }

  private async findValidRefreshToken(rawRefreshToken: string) {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        {
          secret: this.env.JWT_REFRESH_SECRET,
        },
      );
    } catch {
      throw new UnauthorizedException("refresh token is invalid");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("refresh token is invalid");
    }

    const session = await this.database.refreshToken.findUnique({
      where: {
        sessionId: payload.sessionId,
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("refresh token is invalid");
    }

    const matches = await argon2.verify(session.tokenHash, rawRefreshToken);

    if (!matches) {
      throw new UnauthorizedException("refresh token is invalid");
    }

    return session;
  }

  async rotateRefreshSession(rawRefreshToken: string) {
    const session = await this.findValidRefreshToken(rawRefreshToken);
    const revokedAt = new Date();
    const result = await this.database.refreshToken.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: { revokedAt },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException("refresh token is invalid");
    }

    return session.userId;
  }

  private sanitizeUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      planType: user.planType,
      status: user.status,
      isStaff: user.isStaff,
      internalRole: user.internalRole,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
