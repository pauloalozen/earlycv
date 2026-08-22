import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  classifyJourneySession,
  type JourneySessionClassification,
  type JourneySessionEventSignal,
} from "./journey-session-classification";

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
export class JourneySessionClassificationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Camada derivável e consistente pra dashboards consumirem depois --
  // não persiste nada, não altera os eventos já gravados. Sempre
  // recalculada a partir do histórico real de BusinessFunnelEvent da
  // sessão (chave: metadata.sessionInternalId, o UUID de jornada do
  // frontend -- ver docs/runbook/events.md seção 2).
  async classify(
    sessionInternalId: string,
  ): Promise<JourneySessionClassification> {
    const trimmed = sessionInternalId.trim();
    if (!trimmed) {
      return "unknown";
    }

    const events = await this.loadSessionEvents(trimmed);
    const signals = events.map((event) => this.toSignal(event));

    return classifyJourneySession(signals);
  }

  private async loadSessionEvents(sessionInternalId: string) {
    const client = this.database as unknown as BusinessFunnelEventReadClient;

    return client.businessFunnelEvent.findMany({
      where: {
        metadataJson: {
          path: ["sessionInternalId"],
          equals: sessionInternalId,
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
  }): JourneySessionEventSignal {
    const metadata =
      event.metadataJson && typeof event.metadataJson === "object"
        ? (event.metadataJson as Record<string, unknown>)
        : {};

    return {
      eventName: event.eventName,
      occurredAt: event.createdAt,
      isAuthenticated: metadata.isAuthenticated === true,
    };
  }
}
