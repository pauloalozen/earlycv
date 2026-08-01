import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { SemanticFilterAdminService } from "./semantic-filter-admin.service";

type ListCrawlerDiscardsParams = {
  filterReason?: "noise_signal" | "zona_cinza";
  page?: number;
  pageSize?: number;
  search?: string;
  sourceId?: string;
};

@Injectable()
export class CrawlerDiscardService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SemanticFilterAdminService)
    private readonly semanticFilterAdminService: SemanticFilterAdminService,
  ) {}

  async getDiscardedCount() {
    return this.database.crawlerDiscardedTitle.count({
      where: { whitelistedAt: null },
    });
  }

  async list(params: ListCrawlerDiscardsParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CrawlerDiscardedTitleWhereInput = {};

    if (params.filterReason === "zona_cinza") {
      where.filterReason = "zona_cinza";
    } else if (params.filterReason === "noise_signal") {
      where.filterReason = { startsWith: "noise_signal:" };
    }

    if (params.sourceId) {
      where.jobSourceId = params.sourceId;
    }

    if (params.search) {
      where.title = { contains: params.search, mode: "insensitive" };
    }

    const [rows, total] = await Promise.all([
      this.database.crawlerDiscardedTitle.findMany({
        where,
        orderBy: { discardedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          jobSource: { select: { sourceName: true } },
        },
      }),
      this.database.crawlerDiscardedTitle.count({ where }),
    ]);

    return {
      page,
      pageSize,
      rows: rows.map((row) => ({
        canonicalKey: row.canonicalKey,
        discardedAt: row.discardedAt.toISOString(),
        filterReason: row.filterReason,
        filterVersion: row.filterVersion,
        id: row.id,
        sourceName: row.jobSource.sourceName,
        title: row.title,
        whitelistedAt: row.whitelistedAt?.toISOString() ?? null,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async whitelist(id: string, term: string) {
    const discard = await this.database.crawlerDiscardedTitle.findUnique({
      where: { id },
    });

    if (!discard) {
      throw new NotFoundException("CrawlerDiscardedTitle not found");
    }

    const activeConfig =
      await this.semanticFilterAdminService.getActiveConfig();
    const techSignals = activeConfig
      ? Array.from(new Set([...activeConfig.techSignals, term]))
      : [term];
    const noiseSignals = activeConfig?.noiseSignals ?? [];

    const newVersion = await this.semanticFilterAdminService.createNewVersion({
      description: activeConfig?.description ?? undefined,
      noiseSignals,
      techSignals,
    });

    await this.database.crawlerDiscardedTitle.update({
      where: { id },
      data: { whitelistedAt: new Date() },
    });

    return newVersion;
  }
}
