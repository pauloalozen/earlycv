import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ResumeStatus, UserPlanType } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { SetAdminUserAnalysisCreditsDto } from "./dto/set-admin-user-analysis-credits.dto";
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

// "blank" == null ou string vazia — aproxima o `hasValue` (trim + truthy)
// que o front usa (admin-users-operations.ts) pra decidir completude de
// perfil. Espaco-em-branco-so nunca acontece em dado real vindo do form de
// perfil, entao a diferenca pro trim exato do front e desprezivel.
function blankFieldWhere(
  field: "headline" | "city" | "country",
): Prisma.UserProfileWhereInput {
  return { OR: [{ [field]: null }, { [field]: "" }] };
}

// Espelha buildUserCompletenessStatus (admin-users-operations.ts): mesma
// arvore de decisao (perfil ausente > perfil incompleto > sem cv master >
// completo), so que como filtro SQL em vez de computado em cima do payload
// inteiro ja carregado.
function buildCompletenessStatusWhere(
  status: string,
): Prisma.UserWhereInput | null {
  const allBlank: Prisma.UserWhereInput = {
    profile: {
      is: {
        AND: [
          blankFieldWhere("headline"),
          blankFieldWhere("city"),
          blankFieldWhere("country"),
        ],
      },
    },
  };
  const someFilled: Prisma.UserWhereInput = {
    profile: {
      is: {
        OR: [
          { NOT: blankFieldWhere("headline") },
          { NOT: blankFieldWhere("city") },
          { NOT: blankFieldWhere("country") },
        ],
      },
    },
  };
  const complete: Prisma.UserWhereInput = {
    profile: {
      is: {
        AND: [
          { NOT: blankFieldWhere("headline") },
          { NOT: blankFieldWhere("city") },
          { NOT: blankFieldWhere("country") },
        ],
      },
    },
  };
  const hasMasterResume: Prisma.UserWhereInput = {
    resumes: { some: { isMaster: true } },
  };
  const noMasterResume: Prisma.UserWhereInput = {
    resumes: { none: { isMaster: true } },
  };

  switch (status) {
    case "perfil ausente":
      return { OR: [{ profile: null }, allBlank] };
    case "perfil incompleto":
      return { AND: [someFilled, { NOT: complete }] };
    case "sem cv master":
      return { AND: [complete, noMasterResume] };
    case "completo":
      return { AND: [complete, hasMasterResume] };
    default:
      return null;
  }
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list(filters: {
    page?: number;
    limit?: number;
    planType?: UserPlanType;
    query?: string;
    status?: string;
  } = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 50;
    // Sem page/limit explicitos, mantem o comportamento antigo (devolve
    // todo mundo, sem take) — os agregados do dashboard (/admin) e os
    // lookups por id (perfis/curriculos/usuarios/[id]) ainda dependem de
    // ver a base inteira de uma vez. So pagina de verdade quando quem
    // chamou pediu explicitamente (a tela /admin/usuarios agora sempre
    // pede).
    const paginate = filters.page !== undefined || filters.limit !== undefined;
    const statusWhere = filters.status
      ? buildCompletenessStatusWhere(filters.status)
      : null;

    // AND explicito em vez de espalhar cada filtro no mesmo objeto: tanto
    // statusWhere quanto o filtro de busca usam a chave `OR` — espalhados
    // juntos, o segundo sobrescreveria o primeiro em vez de combinar (bug
    // pego pelo teste "filters by completeness status", que so falhava
    // quando query e status vinham juntos).
    const where: Prisma.UserWhereInput = {
      AND: [
        { isStaff: false },
        ...(filters.planType ? [{ planType: filters.planType }] : []),
        ...(statusWhere ? [statusWhere] : []),
        ...(filters.query
          ? [
              {
                OR: [
                  { id: { contains: filters.query, mode: "insensitive" } },
                  { name: { contains: filters.query, mode: "insensitive" } },
                  { email: { contains: filters.query, mode: "insensitive" } },
                ],
              } satisfies Prisma.UserWhereInput,
            ]
          : []),
      ],
    };

    const [users, total] = await Promise.all([
      this.database.user.findMany({
        where,
        ...adminUserArgs,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        ...(paginate ? { skip: (page - 1) * limit, take: limit } : {}),
      }),
      this.database.user.count({ where }),
    ]);

    return {
      limit,
      page,
      total,
      users: users.map((user) => this.serializeUser(user)),
    };
  }

  async listResumes(filters: {
    page?: number;
    limit?: number;
    kind?: "master" | "base" | "adapted";
    query?: string;
    status?: ResumeStatus;
  } = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 50;

    // Espelha getResumeDisplayKind (admin-users-operations.ts): master
    // sempre que isMaster, senao adapted/base pelo campo cru `kind`.
    const kindWhere: Prisma.ResumeWhereInput | undefined =
      filters.kind === "master"
        ? { isMaster: true }
        : filters.kind === "adapted"
          ? { isMaster: false, kind: "adapted" }
          : filters.kind === "base"
            ? { isMaster: false, kind: "master" }
            : undefined;

    const where: Prisma.ResumeWhereInput = {
      user: { isStaff: false },
      ...(kindWhere ?? {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { id: { contains: filters.query, mode: "insensitive" } },
              { title: { contains: filters.query, mode: "insensitive" } },
              {
                user: { name: { contains: filters.query, mode: "insensitive" } },
              },
              {
                user: {
                  email: { contains: filters.query, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const [resumes, total] = await Promise.all([
      this.database.resume.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          isMaster: true,
          kind: true,
          status: true,
          title: true,
          user: { select: { email: true, id: true, name: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.database.resume.count({ where }),
    ]);

    return { limit, page, resumes, total };
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

  async setAnalysisCredits(
    userId: string,
    dto: SetAdminUserAnalysisCreditsDto,
  ) {
    await this.loadProductUserById(userId);

    const user = await this.database.user.update({
      where: { id: userId },
      data: { analysisCreditsRemaining: dto.analysisCreditsRemaining },
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

  async deleteById(userId: string) {
    await this.loadProductUserById(userId);
    await this.database.user.delete({ where: { id: userId } });
    return { ok: true };
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
      analysisCreditsRemaining: user.analysisCreditsRemaining,
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
