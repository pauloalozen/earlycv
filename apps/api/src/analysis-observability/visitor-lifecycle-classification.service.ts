import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  classifyVisitorLifecycle,
  type VisitorEventSignal,
  type VisitorLifecycleClassification,
} from "./visitor-lifecycle-classification";

type BusinessFunnelEventReadClient = {
  businessFunnelEvent: {
    findMany: (args: {
      where: { metadataJson: { path: string[]; equals: string } };
      orderBy: { createdAt: "asc" };
      select: { eventName: true; createdAt: true; metadataJson: true };
    }) => Promise<
      Array<{
        eventName: string;
        createdAt: Date;
        metadataJson: unknown;
      }>
    >;
  };
};

@Injectable()
export class VisitorLifecycleClassificationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Camada derivável, não persiste nada — sempre recalculada a partir do
  // histórico real de BusinessFunnelEvent do visitor_id (chave:
  // metadata.visitor_id). currentSessionInternalId identifica qual jornada
  // (metadata.sessionInternalId) está sendo classificada dentro do
  // histórico desse visitante.
  async classify(
    visitorId: string,
    currentSessionInternalId: string,
  ): Promise<VisitorLifecycleClassification> {
    const trimmedVisitorId = visitorId.trim();
    const trimmedSessionInternalId = currentSessionInternalId.trim();
    if (!trimmedVisitorId || !trimmedSessionInternalId) {
      return "unknown";
    }

    const events = await this.loadVisitorEvents(trimmedVisitorId);
    const signals = events
      .map((event) => this.toSignal(event))
      .filter((signal): signal is VisitorEventSignal => signal !== null);

    return classifyVisitorLifecycle(trimmedSessionInternalId, signals);
  }

  private async loadVisitorEvents(visitorId: string) {
    const client = this.database as unknown as BusinessFunnelEventReadClient;

    return client.businessFunnelEvent.findMany({
      where: {
        metadataJson: {
          path: ["visitor_id"],
          equals: visitorId,
        },
      },
      orderBy: { createdAt: "asc" },
      select: { eventName: true, createdAt: true, metadataJson: true },
    });
  }

  private toSignal(event: {
    eventName: string;
    createdAt: Date;
    metadataJson: unknown;
  }): VisitorEventSignal | null {
    const metadata =
      event.metadataJson && typeof event.metadataJson === "object"
        ? (event.metadataJson as Record<string, unknown>)
        : {};

    const sessionInternalId = metadata.sessionInternalId;
    if (typeof sessionInternalId !== "string" || !sessionInternalId.trim()) {
      return null;
    }

    return {
      sessionInternalId,
      occurredAt: event.createdAt,
    };
  }
}
