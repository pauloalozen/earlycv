import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { DatabaseService } from "../database/database.service";

type BusinessFunnelProjectionEvent = {
  createdAt: Date;
  eventName: string;
  metadataJson: Prisma.JsonValue | null;
};

type BusinessFunnelSourceEvent = {
  correlationId: string;
  createdAt: Date;
  eventName: string;
  metadataJson: Prisma.JsonValue | null;
  requestId: string;
  sessionInternalId: string | null;
  userId: string | null;
};

export type BusinessFunnelDailyStageMetrics = {
  stageKey: string;
  totalCount: number;
  successCount: number;
  errorCount: number;
  conversionCount: number;
  dropOffCount: number;
  conversionRate: number;
  dropOffRate: number;
  avgStepDeltaMs: number | null;
};

export type BusinessFunnelDailyTransitionMetrics = {
  fromStageKey: string;
  toStageKey: string;
  totalCount: number;
  avgStepDeltaMs: number;
};

export type BusinessFunnelDailyProjection = {
  metricDate: Date;
  stages: BusinessFunnelDailyStageMetrics[];
  transitions: BusinessFunnelDailyTransitionMetrics[];
};

type BusinessFunnelProjectionWriteClient = {
  businessFunnelStageMetric: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

type BusinessFunnelProjectionReadClient = {
  businessFunnelEvent: {
    findMany: (args: {
      where: {
        createdAt: {
          gte: Date;
          lt: Date;
        };
      };
      orderBy: { createdAt: "asc" };
      select: {
        correlationId: true;
        createdAt: true;
        eventName: true;
        metadataJson: true;
        requestId: true;
        sessionInternalId: true;
        userId: true;
      };
    }) => Promise<BusinessFunnelSourceEvent[]>;
  };
};

type BusinessFunnelProjectionRebuildWriteClient = {
  businessFunnelStageMetric: {
    deleteMany: (args: {
      where: {
        metricDate: {
          gte: Date;
          lte: Date;
        };
      };
    }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{
        avgLatencyMs: number | null;
        errorCount: number;
        metricDate: Date;
        stageKey: string;
        successCount: number;
        totalCount: number;
      }>;
    }) => Promise<unknown>;
  };
};

@Injectable()
export class BusinessFunnelProjectionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async applyEvent(
    event: BusinessFunnelProjectionEvent,
    writeClient?: BusinessFunnelProjectionWriteClient,
  ): Promise<void> {
    const metricDate = this.toMetricDate(event.createdAt);
    const outcome = this.resolveOutcome(event);
    const client = writeClient ?? this.database;

    await client.businessFunnelStageMetric.upsert({
      where: {
        stageKey_metricDate: {
          metricDate,
          stageKey: event.eventName,
        },
      },
      create: {
        errorCount: outcome === "error" ? 1 : 0,
        metricDate,
        stageKey: event.eventName,
        successCount: outcome === "success" ? 1 : 0,
        totalCount: 1,
      },
      update: {
        errorCount: { increment: outcome === "error" ? 1 : 0 },
        successCount: { increment: outcome === "success" ? 1 : 0 },
        totalCount: { increment: 1 },
      },
    });
  }

  async deriveDailyProjection(
    metricDate: Date,
  ): Promise<BusinessFunnelDailyProjection> {
    const day = this.toMetricDate(metricDate);
    const { endExclusive } = this.toInclusiveDayRange(day, day);
    const readClient = this
      .database as unknown as BusinessFunnelProjectionReadClient;

    const events = await readClient.businessFunnelEvent.findMany({
      where: {
        createdAt: {
          gte: day,
          lt: endExclusive,
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        correlationId: true,
        createdAt: true,
        eventName: true,
        metadataJson: true,
        requestId: true,
        sessionInternalId: true,
        userId: true,
      },
    });

    return this.buildDailyProjection(day, events);
  }

  async rebuildFromSource(params: { from: Date; to?: Date }) {
    const fromDay = this.toMetricDate(params.from);
    const toDay = this.toMetricDate(params.to ?? params.from);
    const { end, endExclusive, start } = this.toInclusiveDayRange(
      fromDay,
      toDay,
    );

    const readClient = this
      .database as unknown as BusinessFunnelProjectionReadClient;
    const writeClient = this
      .database as unknown as BusinessFunnelProjectionRebuildWriteClient;

    const events = await readClient.businessFunnelEvent.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: endExclusive,
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        correlationId: true,
        createdAt: true,
        eventName: true,
        metadataJson: true,
        requestId: true,
        sessionInternalId: true,
        userId: true,
      },
    });

    const eventsByDay = new Map<string, BusinessFunnelSourceEvent[]>();

    for (const event of events) {
      const dayKey = this.toMetricDateKey(event.createdAt);
      const dailyEvents = eventsByDay.get(dayKey);

      if (dailyEvents) {
        dailyEvents.push(event);
      } else {
        eventsByDay.set(dayKey, [event]);
      }
    }

    const sortedDays = Array.from(eventsByDay.keys()).sort();
    const projections = sortedDays.map((dayKey) => {
      const [year, month, day] = dayKey.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return this.buildDailyProjection(date, eventsByDay.get(dayKey) ?? []);
    });

    const rows = projections.flatMap((projection) =>
      this.toStageMetricRows(projection),
    );

    await writeClient.businessFunnelStageMetric.deleteMany({
      where: {
        metricDate: {
          gte: start,
          lte: end,
        },
      },
    });

    if (rows.length > 0) {
      await writeClient.businessFunnelStageMetric.createMany({ data: rows });
    }

    return {
      daysRebuilt: projections.length,
      rowsWritten: rows.length,
    };
  }

  private toMetricDate(createdAt: Date) {
    return new Date(
      Date.UTC(
        createdAt.getUTCFullYear(),
        createdAt.getUTCMonth(),
        createdAt.getUTCDate(),
      ),
    );
  }

  private resolveOutcome(event: BusinessFunnelProjectionEvent) {
    const metadata = event.metadataJson;

    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const outcome = (metadata as Record<string, unknown>).outcome;

      if (outcome === "success" || outcome === "error") {
        return outcome;
      }
    }

    if (
      event.eventName.endsWith("_failed") ||
      event.eventName.endsWith("_error")
    ) {
      return "error";
    }

    if (
      event.eventName.endsWith("_success") ||
      event.eventName.endsWith("_succeeded")
    ) {
      return "success";
    }

    return "unknown";
  }

  private toInclusiveDayRange(from: Date, to: Date) {
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    return {
      end,
      endExclusive,
      start,
    };
  }

  private toMetricDateKey(inputDate: Date) {
    const metricDate = this.toMetricDate(inputDate);
    const year = metricDate.getUTCFullYear();
    const month = String(metricDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(metricDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private buildDailyProjection(
    metricDate: Date,
    events: BusinessFunnelSourceEvent[],
  ): BusinessFunnelDailyProjection {
    const sortedEvents = [...events].sort((left, right) =>
      this.compareEvents(left, right),
    );

    const stageMap = new Map<
      string,
      {
        avgStepDeltaCount: number;
        avgStepDeltaSumMs: number;
        conversionCount: number;
        dropOffCount: number;
        errorCount: number;
        successCount: number;
        totalCount: number;
      }
    >();
    const transitionsMap = new Map<
      string,
      {
        avgStepDeltaSumMs: number;
        fromStageKey: string;
        toStageKey: string;
        totalCount: number;
      }
    >();
    const actorEventSequences = new Map<string, BusinessFunnelSourceEvent[]>();

    for (const event of sortedEvents) {
      const stage = stageMap.get(event.eventName) ?? {
        avgStepDeltaCount: 0,
        avgStepDeltaSumMs: 0,
        conversionCount: 0,
        dropOffCount: 0,
        errorCount: 0,
        successCount: 0,
        totalCount: 0,
      };

      stage.totalCount += 1;
      const outcome = this.resolveOutcome(event);

      if (outcome === "success") {
        stage.successCount += 1;
      } else if (outcome === "error") {
        stage.errorCount += 1;
      }

      stageMap.set(event.eventName, stage);

      const actorKey = this.resolveActorKey(event);
      const sequence = actorEventSequences.get(actorKey);

      if (sequence) {
        sequence.push(event);
      } else {
        actorEventSequences.set(actorKey, [event]);
      }
    }

    for (const sequence of actorEventSequences.values()) {
      const ordered = [...sequence].sort((left, right) =>
        this.compareEvents(left, right),
      );

      for (let index = 0; index < ordered.length; index += 1) {
        const current = ordered[index];
        const stage = stageMap.get(current.eventName);

        if (!stage) {
          continue;
        }

        if (index === ordered.length - 1) {
          stage.dropOffCount += 1;
          continue;
        }

        const next = ordered[index + 1];
        const deltaMs = Math.max(
          0,
          next.createdAt.getTime() - current.createdAt.getTime(),
        );

        stage.conversionCount += 1;
        stage.avgStepDeltaCount += 1;
        stage.avgStepDeltaSumMs += deltaMs;

        const transitionKey = `${current.eventName}->${next.eventName}`;
        const transition = transitionsMap.get(transitionKey) ?? {
          avgStepDeltaSumMs: 0,
          fromStageKey: current.eventName,
          toStageKey: next.eventName,
          totalCount: 0,
        };

        transition.totalCount += 1;
        transition.avgStepDeltaSumMs += deltaMs;
        transitionsMap.set(transitionKey, transition);
      }
    }

    const stages = Array.from(stageMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stageKey, stage]) => {
        const opportunities = stage.conversionCount + stage.dropOffCount;

        return {
          avgStepDeltaMs:
            stage.avgStepDeltaCount > 0
              ? stage.avgStepDeltaSumMs / stage.avgStepDeltaCount
              : null,
          conversionCount: stage.conversionCount,
          conversionRate:
            opportunities > 0 ? stage.conversionCount / opportunities : 0,
          dropOffCount: stage.dropOffCount,
          dropOffRate:
            opportunities > 0 ? stage.dropOffCount / opportunities : 0,
          errorCount: stage.errorCount,
          stageKey,
          successCount: stage.successCount,
          totalCount: stage.totalCount,
        };
      });

    const transitions = Array.from(transitionsMap.values())
      .sort((left, right) => {
        const fromComparison = left.fromStageKey.localeCompare(
          right.fromStageKey,
        );

        if (fromComparison !== 0) {
          return fromComparison;
        }

        return left.toStageKey.localeCompare(right.toStageKey);
      })
      .map((transition) => ({
        avgStepDeltaMs: transition.avgStepDeltaSumMs / transition.totalCount,
        fromStageKey: transition.fromStageKey,
        toStageKey: transition.toStageKey,
        totalCount: transition.totalCount,
      }));

    return {
      metricDate,
      stages,
      transitions,
    };
  }

  private toStageMetricRows(projection: BusinessFunnelDailyProjection) {
    const rows: Array<{
      avgLatencyMs: number | null;
      errorCount: number;
      metricDate: Date;
      stageKey: string;
      successCount: number;
      totalCount: number;
    }> = [];

    for (const stage of projection.stages) {
      rows.push({
        avgLatencyMs: stage.avgStepDeltaMs,
        errorCount: stage.errorCount,
        metricDate: projection.metricDate,
        stageKey: stage.stageKey,
        successCount: stage.successCount,
        totalCount: stage.totalCount,
      });

      rows.push({
        avgLatencyMs: stage.avgStepDeltaMs,
        errorCount: stage.dropOffCount,
        metricDate: projection.metricDate,
        stageKey: `derived:${stage.stageKey}`,
        successCount: stage.conversionCount,
        totalCount: stage.conversionCount + stage.dropOffCount,
      });
    }

    for (const transition of projection.transitions) {
      rows.push({
        avgLatencyMs: transition.avgStepDeltaMs,
        errorCount: 0,
        metricDate: projection.metricDate,
        stageKey: `transition:${transition.fromStageKey}->${transition.toStageKey}`,
        successCount: 0,
        totalCount: transition.totalCount,
      });
    }

    return rows;
  }

  private compareEvents(
    left: BusinessFunnelSourceEvent,
    right: BusinessFunnelSourceEvent,
  ) {
    const createdAtComparison =
      left.createdAt.getTime() - right.createdAt.getTime();

    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    const requestComparison = left.requestId.localeCompare(right.requestId);

    if (requestComparison !== 0) {
      return requestComparison;
    }

    const correlationComparison = left.correlationId.localeCompare(
      right.correlationId,
    );

    if (correlationComparison !== 0) {
      return correlationComparison;
    }

    return left.eventName.localeCompare(right.eventName);
  }

  private resolveActorKey(event: BusinessFunnelSourceEvent) {
    if (event.sessionInternalId) {
      return `session:${event.sessionInternalId}`;
    }

    if (event.userId) {
      return `user:${event.userId}`;
    }

    if (event.correlationId) {
      return `correlation:${event.correlationId}`;
    }

    return `request:${event.requestId}`;
  }
}
