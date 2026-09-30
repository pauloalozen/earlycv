import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { buildCompletenessStatusWhere } from "../admin-users/admin-users.service";
import { DatabaseService } from "../database/database.service";
import {
  type ListPendingDto,
  PENDING_TYPES,
  type PendingType,
} from "./dto/list-pending.dto";

export type PendingItemDto = {
  cta: string;
  description: string;
  entityId: string;
  priority: "alta";
  title: string;
  type: PendingType;
};

const USER_COMPLETENESS_BY_TYPE = {
  "user-incomplete-profile": "perfil incompleto",
  "user-missing-master-resume": "sem cv master",
  "user-missing-profile": "perfil ausente",
} as const;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Fila de pendências do operacional montada NO BANCO e paginada. Antes a tela
// carregava usuários, empresas e fontes inteiros e montava/filtrava a lista
// em memória. Cada tipo tem sua contagem e sua página (skip/take); a página
// pedida é uma janela sobre os tipos na ordem de PENDING_TYPES.
@Injectable()
export class AdminPendingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async list(dto: ListPendingDto) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, dto.pageSize ?? 20));
    const query = dto.query?.trim() || undefined;
    const types = dto.type ? [dto.type] : [...PENDING_TYPES];

    const counts = await Promise.all(
      types.map((type) => this.countType(type, query)),
    );
    const countsByType = Object.fromEntries(
      PENDING_TYPES.map((type) => [type, 0]),
    ) as Record<PendingType, number>;
    types.forEach((type, index) => {
      countsByType[type] = counts[index] ?? 0;
    });
    const total = counts.reduce((sum, value) => sum + value, 0);

    let offset = (page - 1) * pageSize;
    let remaining = pageSize;
    const items: PendingItemDto[] = [];

    for (let i = 0; i < types.length && remaining > 0; i += 1) {
      const type = types[i] as PendingType;
      const count = counts[i] ?? 0;
      if (offset >= count) {
        offset -= count;
        continue;
      }
      const take = Math.min(remaining, count - offset);
      items.push(...(await this.pageType(type, query, offset, take)));
      remaining -= take;
      offset = 0;
    }

    return {
      counts: countsByType,
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private userWhere(
    type: keyof typeof USER_COMPLETENESS_BY_TYPE,
    query?: string,
  ) {
    const completeness = buildCompletenessStatusWhere(
      USER_COMPLETENESS_BY_TYPE[type],
    );
    return {
      AND: [
        { isStaff: false },
        ...(completeness ? [completeness] : []),
        ...(query
          ? [
              {
                OR: [
                  { id: { contains: query, mode: "insensitive" as const } },
                  { name: { contains: query, mode: "insensitive" as const } },
                  { email: { contains: query, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    } satisfies Prisma.UserWhereInput;
  }

  private async countType(type: PendingType, query?: string): Promise<number> {
    switch (type) {
      case "company-missing-source":
        return this.database.company.count({
          where: {
            jobSources: { none: {} },
            ...(query
              ? { name: { contains: query, mode: "insensitive" } }
              : {}),
          },
        });
      case "source-missing-first-run":
        return this.database.jobSource.count({
          where: {
            ingestionRuns: { none: {} },
            ...(query
              ? { sourceName: { contains: query, mode: "insensitive" } }
              : {}),
          },
        });
      case "source-failed-recent-run": {
        const rows = await this.database.$queryRaw<Array<{ n: number }>>(
          Prisma.sql`
            SELECT count(*)::int AS n
            FROM "JobSource" s
            JOIN LATERAL (
              SELECT r.status FROM "IngestionRun" r
              WHERE r."jobSourceId" = s.id
              ORDER BY r."startedAt" DESC, r."createdAt" DESC LIMIT 1
            ) l ON true
            WHERE (l.status = 'failed' OR s."lastErrorMessage" IS NOT NULL)
            ${
              query
                ? Prisma.sql`AND s."sourceName" ILIKE ${`%${escapeLike(query)}%`}`
                : Prisma.empty
            }
          `,
        );
        return rows[0]?.n ?? 0;
      }
      default:
        return this.database.user.count({ where: this.userWhere(type, query) });
    }
  }

  private async pageType(
    type: PendingType,
    query: string | undefined,
    skip: number,
    take: number,
  ): Promise<PendingItemDto[]> {
    switch (type) {
      case "company-missing-source": {
        const rows = await this.database.company.findMany({
          where: {
            jobSources: { none: {} },
            ...(query
              ? { name: { contains: query, mode: "insensitive" } }
              : {}),
          },
          select: { id: true, name: true },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          skip,
          take,
        });
        return rows.map((row) => ({
          cta: "Criar primeira fonte",
          description: "Empresa criada sem nenhuma fonte de vagas conectada.",
          entityId: row.id,
          priority: "alta",
          title: row.name,
          type,
        }));
      }
      case "source-missing-first-run": {
        const rows = await this.database.jobSource.findMany({
          where: {
            ingestionRuns: { none: {} },
            ...(query
              ? { sourceName: { contains: query, mode: "insensitive" } }
              : {}),
          },
          select: { id: true, sourceName: true },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          skip,
          take,
        });
        return rows.map((row) => ({
          cta: "Rodar agora",
          description:
            "A fonte foi cadastrada, mas ainda nao executou a primeira ingestao.",
          entityId: row.id,
          priority: "alta",
          title: row.sourceName,
          type,
        }));
      }
      case "source-failed-recent-run": {
        const rows = await this.database.$queryRaw<
          Array<{
            id: string;
            lastErrorMessage: string | null;
            sourceName: string;
          }>
        >(Prisma.sql`
          SELECT s.id, s."sourceName", s."lastErrorMessage"
          FROM "JobSource" s
          JOIN LATERAL (
            SELECT r.status FROM "IngestionRun" r
            WHERE r."jobSourceId" = s.id
            ORDER BY r."startedAt" DESC, r."createdAt" DESC LIMIT 1
          ) l ON true
          WHERE (l.status = 'failed' OR s."lastErrorMessage" IS NOT NULL)
          ${
            query
              ? Prisma.sql`AND s."sourceName" ILIKE ${`%${escapeLike(query)}%`}`
              : Prisma.empty
          }
          ORDER BY s."updatedAt" DESC, s.id
          LIMIT ${take} OFFSET ${skip}
        `);
        return rows.map((row) => ({
          cta: "Revisar falha",
          description:
            row.lastErrorMessage ?? "O ultimo run da fonte terminou com falha.",
          entityId: row.id,
          priority: "alta",
          title: row.sourceName,
          type,
        }));
      }
      default: {
        const rows = await this.database.user.findMany({
          where: this.userWhere(type, query),
          select: { id: true, name: true },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          skip,
          take,
        });
        const copy = {
          "user-incomplete-profile": {
            cta: "Completar perfil",
            description:
              "Perfil iniciado, mas ainda sem todos os campos obrigatorios para seguir no fluxo.",
          },
          "user-missing-master-resume": {
            cta: "Enviar CV master",
            description:
              "Usuario com perfil pronto, mas ainda sem um CV master para adaptar vagas.",
          },
          "user-missing-profile": {
            cta: "Iniciar perfil",
            description:
              "Usuario sem perfil preenchido para alimentar o fluxo de adaptacao.",
          },
        }[type];
        return rows.map((row) => ({
          ...copy,
          entityId: row.id,
          priority: "alta" as const,
          title: row.name,
          type,
        }));
      }
    }
  }
}
