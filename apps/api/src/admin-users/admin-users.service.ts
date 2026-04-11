import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { SetAdminUserCreditsDto } from "./dto/set-admin-user-credits.dto";
import type { StartAssistedSessionDto } from "./dto/start-assisted-session.dto";
import type { UpdateAdminUserDto } from "./dto/update-admin-user.dto";
import type { UpdateAdminUserPlanDto } from "./dto/update-admin-user-plan.dto";
import type { UpdateAdminUserStatusDto } from "./dto/update-admin-user-status.dto";

const adminUserArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    profile: {
      select: {
        headline: true,
        city: true,
        country: true,
      },
    },
    resumes: {
      select: {
        id: true,
        title: true,
        status: true,
        kind: true,
        isMaster: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    },
  },
});

type AdminUserRecord = Prisma.UserGetPayload<typeof adminUserArgs>;

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list() {
    const users = await this.database.user.findMany({
      where: { isStaff: false },
      ...adminUserArgs,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return users.map((user) => this.serializeUser(user));
  }

  async getById(userId: string) {
    const user = await this.loadProductUserById(userId);

    return this.serializeUser(user);
  }

  async update(userId: string, dto: UpdateAdminUserDto) {
    const existingUser = await this.loadProductUserById(userId);
    const emailChanged =
      dto.email !== undefined && dto.email !== existingUser.email;

    const data = {
      ...dto,
      emailVerifiedAt: emailChanged ? null : undefined,
    };

    try {
      const user = await this.database.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data,
          ...adminUserArgs,
        });

        if (emailChanged) {
          await tx.authAccount.updateMany({
            where: {
              userId,
              provider: "credentials",
            },
            data: {
              providerAccountId: dto.email,
              providerEmail: dto.email,
            },
          });
        }

        return updatedUser;
      });

      return this.serializeUser(user);
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async updatePlan(userId: string, dto: UpdateAdminUserPlanDto) {
    await this.loadProductUserById(userId);

    const user = await this.database.user.update({
      where: { id: userId },
      data: { planType: dto.planType },
      ...adminUserArgs,
    });

    return this.serializeUser(user);
  }

  async updateStatus(userId: string, dto: UpdateAdminUserStatusDto) {
    await this.loadProductUserById(userId);

    const user = await this.database.user.update({
      where: { id: userId },
      data: { status: dto.status },
      ...adminUserArgs,
    });

    return this.serializeUser(user);
  }

  async setCredits(userId: string, dto: SetAdminUserCreditsDto) {
    await this.loadProductUserById(userId);

    const user = await this.database.user.update({
      where: { id: userId },
      data: { creditsRemaining: dto.creditsRemaining },
      ...adminUserArgs,
    });

    return this.serializeUser(user);
  }

  async startAssistedSession(
    operatorUserId: string,
    targetUserId: string,
    dto: StartAssistedSessionDto,
  ) {
    await this.loadProductUserById(targetUserId);

    return {
      mode: "assisted" as const,
      operatorUserId,
      targetUserId,
      reason: dto.reason,
      banner: "Sessao assistida ativa",
    };
  }

  private async loadProductUserById(userId: string) {
    const user = await this.database.user.findFirst({
      where: {
        id: userId,
        isStaff: false,
      },
      ...adminUserArgs,
    });

    if (!user) {
      throw new NotFoundException("user not found");
    }

    return user;
  }

  private serializeUser(user: AdminUserRecord) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      planType: user.planType,
      creditsRemaining: user.creditsRemaining,
      status: user.status,
      isStaff: user.isStaff,
      internalRole: user.internalRole,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: {
        headline: user.profile?.headline ?? null,
        city: user.profile?.city ?? null,
        country: user.profile?.country ?? null,
      },
      resumes: user.resumes.map((resume) => ({
        id: resume.id,
        title: resume.title,
        status: resume.status,
        kind: resume.kind,
        isMaster: resume.isMaster,
      })),
    };
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("email is already registered");
    }

    throw error;
  }
}
