import { randomUUID } from "node:crypto";

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, type UserStatus } from "@prisma/client";
import * as argon2 from "argon2";

import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import type { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RefreshDto } from "./dto/refresh.dto";
import type { RegisterDto } from "./dto/register.dto";

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
  ) {}

  async register(input: RegisterDto): Promise<AuthSession> {
    const user = await this.createUser({
      email: input.email,
      password: input.password,
      name: input.name,
    });

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
