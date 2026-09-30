import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { normalizeCompanyName } from "../ingestion/name-normalization";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import type {
  CompanyStatusLabel,
  ListCompaniesDto,
} from "./dto/list-companies.dto";
import type { UpdateCompanyDto } from "./dto/update-company.dto";

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Status operacional da empresa, calculado no banco com a MESMA regra de
  // buildCompanyStatus (front): sem fontes => incompleta; alguma fonte sem run
  // e sem erro => aguardando primeiro run; alguma fonte com erro ou última run
  // falha => com falha recente; senão completa. Só agrega id/flags (nunca
  // carrega runs ou colunas grandes) e pode ser restrito a um conjunto de ids.
  private async computeStatuses(companyIds?: string[]) {
    const idFilter =
      companyIds && companyIds.length > 0
        ? Prisma.sql`WHERE s."companyId" IN (${Prisma.join(companyIds)})`
        : Prisma.empty;

    const rows = await this.database.$queryRaw<
      Array<{
        companyId: string;
        failed: boolean;
        n: number;
        noRun: boolean;
      }>
    >(Prisma.sql`
      SELECT s."companyId" AS "companyId",
             count(*)::int AS n,
             bool_or(l.status IS NULL AND s."lastErrorMessage" IS NULL) AS "noRun",
             bool_or(s."lastErrorMessage" IS NOT NULL OR l.status = 'failed') AS failed
      FROM "JobSource" s
      LEFT JOIN LATERAL (
        SELECT r.status
        FROM "IngestionRun" r
        WHERE r."jobSourceId" = s.id
        ORDER BY r."startedAt" DESC, r."createdAt" DESC
        LIMIT 1
      ) l ON true
      ${idFilter}
      GROUP BY s."companyId"
    `);

    return new Map(
      rows.map((row) => {
        const label: CompanyStatusLabel = row.noRun
          ? "aguardando primeiro run"
          : row.failed
            ? "com falha recente"
            : "completa";
        return [row.companyId, { label, sourcesCount: row.n }] as const;
      }),
    );
  }

  private toStatus(
    computed: { label: CompanyStatusLabel; sourcesCount: number } | undefined,
  ) {
    const label: CompanyStatusLabel = computed?.label ?? "incompleta";
    const tone =
      label === "completa"
        ? "success"
        : label === "com falha recente"
          ? "danger"
          : "warning";
    return {
      sourcesCount: computed?.sourcesCount ?? 0,
      status: { label, tone },
    };
  }

  // Listagem paginada NO BANCO (skip/take + count), com busca por nome e
  // filtro de status. Substitui o antigo list(), que devolvia todas as
  // empresas de uma vez e deixava busca, filtro e paginação para o front.
  async listPaginated(dto: ListCompaniesDto) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, dto.pageSize ?? 20));
    const skip = (page - 1) * pageSize;
    const orderBy: Prisma.CompanyOrderByWithRelationInput[] = [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ];
    const where: Prisma.CompanyWhereInput = dto.search
      ? { name: { contains: dto.search, mode: "insensitive" } }
      : {};

    let pageIds: string[];
    let total: number;
    let statuses: Awaited<ReturnType<CompaniesService["computeStatuses"]>>;

    if (dto.status) {
      // Status é derivado das fontes/runs, então não dá para filtrar no
      // findMany. Ordena só ids (leve), classifica com uma agregação e fatia
      // a página — sem carregar linhas de empresa nem de fonte.
      const matching = await this.database.company.findMany({
        where,
        select: { id: true },
        orderBy,
      });
      statuses = await this.computeStatuses();
      const filtered = matching.filter(
        (company) =>
          this.toStatus(statuses.get(company.id)).status.label === dto.status,
      );
      total = filtered.length;
      pageIds = filtered.slice(skip, skip + pageSize).map((c) => c.id);
    } else {
      const [rows, count] = await Promise.all([
        this.database.company.findMany({
          where,
          select: { id: true },
          orderBy,
          skip,
          take: pageSize,
        }),
        this.database.company.count({ where }),
      ]);
      pageIds = rows.map((r) => r.id);
      total = count;
      statuses = await this.computeStatuses(pageIds);
    }

    const companies =
      pageIds.length > 0
        ? await this.database.company.findMany({
            where: { id: { in: pageIds } },
          })
        : [];
    const byId = new Map(companies.map((c) => [c.id, c]));

    return {
      page,
      pageSize,
      rows: pageIds.flatMap((id) => {
        const company = byId.get(id);
        return company
          ? [{ ...company, ...this.toStatus(statuses.get(id)) }]
          : [];
      }),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(companyId: string) {
    const company = await this.database.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException("company not found");
    }

    return company;
  }

  async create(dto: CreateCompanyDto) {
    try {
      return await this.database.company.create({
        data: {
          ...dto,
          normalizedName: normalizeCompanyName(dto.name),
        },
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    await this.getById(companyId);

    try {
      return await this.database.company.update({
        where: { id: companyId },
        data: {
          ...dto,
          normalizedName:
            dto.name === undefined ? undefined : normalizeCompanyName(dto.name),
        },
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async remove(companyId: string) {
    await this.getById(companyId);
    await this.database.company.delete({ where: { id: companyId } });

    return { ok: true } as const;
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("company already exists");
    }

    throw error;
  }
}
