import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuthService } from "../auth/auth.service";
import type { CreateStaffUserDto } from "../auth/dto/create-staff-user.dto";
import { DatabaseService } from "../database/database.service";
import type { UpdateSuperadminStaffDto } from "./dto/update-superadmin-staff.dto";
import type { UpdateSuperadminStaffRoleDto } from "./dto/update-superadmin-staff-role.dto";

type StaffUserRecord = Awaited<
  ReturnType<DatabaseService["user"]["findFirst"]>
>;

@Injectable()
export class SuperadminStaffService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async list() {
    const users = await this.database.user.findMany({
      where: { isStaff: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return users.map((user) => this.serializeUser(user));
  }

  create(dto: CreateStaffUserDto) {
    this.assertInternalRole(dto.internalRole);

    return this.authService.createStaffUser(dto);
  }

  async update(userId: string, dto: UpdateSuperadminStaffDto) {
    const existingUser = await this.getById(userId);
    const emailChanged =
      dto.email !== undefined && dto.email !== existingUser.email;

    try {
      const user = await this.database.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            ...dto,
            emailVerifiedAt: emailChanged ? null : undefined,
          },
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

  async updateRole(userId: string, dto: UpdateSuperadminStaffRoleDto) {
    await this.getById(userId);
    this.assertInternalRole(dto.internalRole);

    const user = await this.database.user.update({
      where: { id: userId },
      data: { internalRole: dto.internalRole },
    });

    return this.serializeUser(user);
  }

  private async getById(userId: string) {
    const user = await this.database.user.findFirst({
      where: {
        id: userId,
        isStaff: true,
      },
    });

    if (!user) {
      throw new NotFoundException("staff user not found");
    }

    return user;
  }

  private serializeUser(user: NonNullable<StaffUserRecord>) {
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

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("email is already registered");
    }

    throw error;
  }

  private assertInternalRole(role: string) {
    if (role !== "admin" && role !== "superadmin") {
      throw new BadRequestException("internalRole must be admin or superadmin");
    }
  }
}
