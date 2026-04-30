import { Inject, Injectable } from "@nestjs/common";
import type { CvUnlockSource, CvUnlockStatus, Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type CvUnlockListItem = {
  id: string;
  unlockedAt: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  cvAdaptationId: string;
  jobTitle: string | null;
  companyName: string | null;
  score: number | null;
  creditsConsumed: number;
  source: CvUnlockSource;
  status: CvUnlockStatus;
};

@Injectable()
export class CvUnlocksService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async listAdminUnlocks(filters: {
    email?: string;
    userId?: string;
    cvAdaptationId?: string;
    source?: CvUnlockSource;
    status?: CvUnlockStatus;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: CvUnlockListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const skip = (page - 1) * limit;

    const where: Prisma.CvUnlockWhereInput = {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.cvAdaptationId
        ? { cvAdaptationId: filters.cvAdaptationId }
        : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.email
        ? {
            user: {
              email: {
                contains: filters.email,
                mode: "insensitive",
              },
            },
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            unlockedAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.database.cvUnlock.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          cvAdaptation: {
            select: { jobTitle: true, companyName: true, aiAuditJson: true },
          },
        },
        orderBy: { unlockedAt: "desc" },
        skip,
        take: limit,
      }),
      this.database.cvUnlock.count({ where }),
    ]);

    return {
      items: items.map((unlock) => ({
        id: unlock.id,
        unlockedAt: unlock.unlockedAt.toISOString(),
        createdAt: unlock.createdAt.toISOString(),
        userId: unlock.userId,
        userName: unlock.user?.name ?? null,
        userEmail: unlock.user?.email ?? null,
        cvAdaptationId: unlock.cvAdaptationId,
        jobTitle: unlock.cvAdaptation?.jobTitle ?? null,
        companyName: unlock.cvAdaptation?.companyName ?? null,
        score: this.extractScore(unlock.cvAdaptation?.aiAuditJson),
        creditsConsumed: unlock.creditsConsumed,
        source: unlock.source,
        status: unlock.status,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private extractScore(aiAuditJson: unknown): number | null {
    if (!aiAuditJson || typeof aiAuditJson !== "object") return null;
    const root = aiAuditJson as Record<string, unknown>;
    const fit = root.fit;
    if (!fit || typeof fit !== "object") return null;
    const score = (fit as Record<string, unknown>).score;
    if (typeof score !== "number") return null;
    return Number.isFinite(score) ? score : null;
  }
}
