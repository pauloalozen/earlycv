import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANALYSIS_PROTECTION_EVENT_VERSION_MAP,
  type AnalysisProtectionEventName,
  BUSINESS_FUNNEL_EVENT_VERSION_MAP,
  type BusinessFunnelEventName,
} from "../analysis-observability/analysis-event-version.registry";
import type { PosthogClientService } from "./posthog-client.service";
import { PosthogEventExporter } from "./posthog-event-exporter.service";

const mockPosthogClient = {
  capture: () => {},
  isEnabled: () => false,
} as unknown as Pick<PosthogClientService, "capture" | "isEnabled">;

test("exports support all business funnel registry events", () => {
  const exporter = new PosthogEventExporter(mockPosthogClient);

  for (const eventName of Object.keys(
    BUSINESS_FUNNEL_EVENT_VERSION_MAP,
  ) as BusinessFunnelEventName[]) {
    assert.equal(
      exporter.shouldExportBusinessFunnelEvent(eventName),
      true,
      `missing business mapping for ${eventName}`,
    );
  }
});

test("exports support all protection registry events", () => {
  const exporter = new PosthogEventExporter(mockPosthogClient);

  for (const eventName of Object.keys(
    ANALYSIS_PROTECTION_EVENT_VERSION_MAP,
  ) as AnalysisProtectionEventName[]) {
    assert.equal(
      exporter.shouldExportProtectionEvent(eventName),
      true,
      `missing protection mapping for ${eventName}`,
    );
  }
});

test("sanitizes prohibited nested properties before export", () => {
  const captured: Array<Record<string, unknown>> = [];
  const exporter = new PosthogEventExporter({
    isEnabled: () => true,
    capture: (_event: string, properties?: Record<string, unknown>) => {
      captured.push(properties ?? {});
    },
  } as unknown as PosthogClientService);

  exporter.exportBusinessFunnelEvent("page_view", {
    event_version: 1,
    pathname: "/adaptar",
    next_url: "http://localhost:3000/adaptar/resultado?adaptationId=abc123",
    next_search: "?adaptationId=abc123",
    next_pathname: "/adaptar/resultado?adaptationId=abc123",
    cv: "raw",
    nested: {
      email: "user@example.com",
      adaptedContentJson: { section: "secret" },
      ok: true,
    },
  });

  assert.equal(captured.length, 1);
  const props = captured[0];
  assert.equal(props.cv, undefined);
  assert.equal(props.next_url, "/adaptar/resultado");
  assert.equal(props.next_search, null);
  assert.equal(props.next_pathname, "/adaptar/resultado");
  assert.equal((props.nested as Record<string, unknown>).email, undefined);
  assert.equal(
    (props.nested as Record<string, unknown>).adaptedContentJson,
    undefined,
  );
  assert.equal((props.nested as Record<string, unknown>).ok, true);
});
