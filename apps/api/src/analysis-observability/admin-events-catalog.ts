import {
  ANALYSIS_PROTECTION_EVENT_VERSION_MAP,
  BUSINESS_FUNNEL_EVENT_VERSION_MAP,
} from "./analysis-event-version.registry";

export type AdminEventDomain = "protection" | "business";

export type AdminEventCatalogItem = {
  eventName: string;
  eventVersion: number;
};

export type AdminEventsCatalog = {
  protection: AdminEventCatalogItem[];
  business: AdminEventCatalogItem[];
};

function toCatalogItems(
  registry: Record<string, number>,
): AdminEventCatalogItem[] {
  return Object.entries(registry).map(([eventName, eventVersion]) => ({
    eventName,
    eventVersion,
  }));
}

export function buildAdminEventsCatalog(): AdminEventsCatalog {
  return {
    protection: toCatalogItems(ANALYSIS_PROTECTION_EVENT_VERSION_MAP),
    business: toCatalogItems(BUSINESS_FUNNEL_EVENT_VERSION_MAP),
  };
}
