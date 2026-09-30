import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DashboardAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Números da visão geral do /admin só com COUNTs: nada de carregar
  // usuários/currículos para contar em memória. Usuários de staff ficam de
  // fora, como sempre ficaram na listagem do admin.
  async getOverviewStats(since: Date) {
    const [totalUsers, newUsers, totalAdaptedResumes] = await Promise.all([
      this.database.user.count({ where: { isStaff: false } }),
      this.database.user.count({
        where: { isStaff: false, createdAt: { gte: since } },
      }),
      this.database.resume.count({
        where: {
          isMaster: false,
          kind: "adapted",
          user: { isStaff: false },
        },
      }),
    ]);

    return { newUsers, totalAdaptedResumes, totalUsers };
  }

  async getIndexingLog(limit: number) {
    return this.database.googleIndexingLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getActivityMetrics(from: Date, to: Date) {
    const days = buildUtcDayBuckets(from, to);

    const [analysisRows, cvUnlockRows, applicationRows, radarViewRows] =
      await Promise.all([
        this.database.analysisJob.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        }),
        this.database.cvUnlock.findMany({
          where: {
            unlockedAt: { gte: from, lte: to },
            status: "UNLOCKED",
          },
          select: { unlockedAt: true },
        }),
        this.database.jobApplication.findMany({
          where: { createdAt: { gte: from, lte: to }, deletedAt: null },
          select: { createdAt: true },
        }),
        this.database.businessFunnelEvent.findMany({
          where: { eventName: "radar_view", createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        }),
      ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      metrics: {
        analyses: buildMetricSeries(
          analysisRows.map((r) => r.createdAt),
          days,
        ),
        cvUnlocks: buildMetricSeries(
          cvUnlockRows.map((r) => r.unlockedAt),
          days,
        ),
        applications: buildMetricSeries(
          applicationRows.map((r) => r.createdAt),
          days,
        ),
        radarViews: buildMetricSeries(
          radarViewRows.map((r) => r.createdAt),
          days,
        ),
      },
    };
  }
}

// ── Helpers para série diária de atividade ──────────────────────────
function buildUtcDayBuckets(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function buildMetricSeries(
  timestamps: Date[],
  days: string[],
): { total: number; series: { date: string; count: number }[] } {
  const counts = new Map<string, number>();
  for (const day of days) counts.set(day, 0);
  for (const ts of timestamps) {
    const key = ts.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    total: timestamps.length,
    series: days.map((date) => ({ date, count: counts.get(date) ?? 0 })),
  };
}
