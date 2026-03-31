import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import type { UpdateCompanyDto } from "./dto/update-company.dto";

function normalizeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  list() {
    return this.database.company.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
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
          normalizedName: normalizeName(dto.name),
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
            dto.name === undefined ? undefined : normalizeName(dto.name),
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
