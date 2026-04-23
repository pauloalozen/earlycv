"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { emitBusinessFunnelEvent } from "@/lib/cv-adaptation-api";
import {
  consumeSessionEngagedOnce,
  consumeSessionStartedOnce,
  createJourneyState,
  finishRouteVisitAndReset,
  isJourneyRouteEligible,
  type JourneyState,
  startRouteVisit,
} from "@/lib/journey-tracking";

const SESSION_KEY = "journey_session_internal_id";
const CHECKOUT_INTENT_KEY = "journey_checkout_intent";
const CHECKOUT_ABANDON_MIN_MS = 60_000;
const CURRENT_ROUTE_VISIT_KEY = "journey_current_route_visit_id";
const PREVIOUS_ROUTE_KEY = "journey_previous_route";

type CheckoutIntentMarker = {
  planId: string;
  routeVisitId: string;
  sessionInternalId: string;
  startedAtMs: number;
};

function buildSessionInternalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `journey-${Date.now()}`;
}

function getSessionInternalId() {
  if (typeof sessionStorage === "undefined") {
    return buildSessionInternalId();
  }

  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const next = buildSessionInternalId();
  sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

function emitInBackground(payload: {
  eventName: string;
  eventVersion: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}) {
  void emitBusinessFunnelEvent(payload).catch((error) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[journey-tracking] failed to emit event", error);
    }
  });
}

function tryEmitWithBeacon(payload: {
  eventName: string;
  eventVersion: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!apiBase) {
    return false;
  }

  const body = JSON.stringify({
    eventName: payload.eventName,
    eventVersion: payload.eventVersion,
    idempotencyKey: payload.idempotencyKey,
    metadata: payload.metadata,
  });

  return navigator.sendBeacon(
    `${apiBase.replace(/\/$/, "")}/analysis-observability/business-funnel-events`,
    new Blob([body], { type: "application/json" }),
  );
}

function buildMetadata(input: {
  occurredAt: string;
  previousRoute: string | null;
  route: string;
  routeVisitId: string;
  sessionInternalId: string;
  timeOnPageMs?: number;
}) {
  return {
    occurredAt: input.occurredAt,
    previous_route: input.previousRoute,
    route: input.route,
    routeVisitId: input.routeVisitId,
    sessionInternalId: input.sessionInternalId,
    time_on_page_ms: input.timeOnPageMs,
    userId: null,
  };
}

function readCheckoutIntent(): CheckoutIntentMarker | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(CHECKOUT_INTENT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CheckoutIntentMarker;
    if (
      !parsed ||
      typeof parsed.planId !== "string" ||
      typeof parsed.routeVisitId !== "string" ||
      typeof parsed.sessionInternalId !== "string" ||
      typeof parsed.startedAtMs !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCheckoutIntent(marker: CheckoutIntentMarker) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(marker));
}

function clearCheckoutIntent() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
}

function setCurrentRouteVisitId(routeVisitId: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(CURRENT_ROUTE_VISIT_KEY, routeVisitId);
}

function clearCurrentRouteVisitId() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.removeItem(CURRENT_ROUTE_VISIT_KEY);
}

function setPreviousRoute(pathname: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(PREVIOUS_ROUTE_KEY, pathname);
}

export function JourneyTrackerProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const stateRef = useRef<JourneyState | null>(null);
  const previousRouteRef = useRef<string | null>(null);
  const pathnameRef = useRef<string>(pathname);
  const emittedLeaveVisitIdsRef = useRef<Set<string>>(new Set<string>());

  useEffect(() => {
    const handleCheckoutIntentSubmit = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) {
        return;
      }

      if (target.getAttribute("action") !== "/plans/checkout") {
        return;
      }

      const formData = new FormData(target);
      const planIdRaw = formData.get("planId");
      if (typeof planIdRaw !== "string" || !planIdRaw.trim()) {
        return;
      }

      const routeVisitId = stateRef.current?.activeRouteVisit?.routeVisitId;
      if (!routeVisitId) {
        return;
      }

      writeCheckoutIntent({
        planId: planIdRaw.trim(),
        routeVisitId,
        sessionInternalId: getSessionInternalId(),
        startedAtMs: Date.now(),
      });
    };

    document.addEventListener("submit", handleCheckoutIntentSubmit, true);

    return () => {
      document.removeEventListener("submit", handleCheckoutIntentSubmit, true);
    };
  }, []);

  if (!stateRef.current) {
    stateRef.current = createJourneyState();
  }

  useEffect(() => {
    if (typeof sessionStorage === "undefined") {
      return;
    }

    previousRouteRef.current = sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
  }, []);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!isJourneyRouteEligible(pathname)) {
      return;
    }

    const sessionInternalId = getSessionInternalId();
    const occurredAt = new Date().toISOString();
    const searchParams = new URLSearchParams(window.location.search);

    if (previousRouteRef.current === null) {
      previousRouteRef.current = sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
    }

    if (
      searchParams.get("plan") === "activated" ||
      searchParams.get("error") === "payment_failed"
    ) {
      clearCheckoutIntent();
    }

    stateRef.current = startRouteVisit(
      stateRef.current ?? createJourneyState(),
      {
        pathname,
        startedAtMs: Date.now(),
      },
    );

    const activeVisit = stateRef.current.activeRouteVisit;
    if (!activeVisit) {
      return;
    }

    setCurrentRouteVisitId(activeVisit.routeVisitId);

    const baseMetadata = buildMetadata({
      occurredAt,
      previousRoute: previousRouteRef.current,
      route: pathname,
      routeVisitId: activeVisit.routeVisitId,
      sessionInternalId,
    });

    emitInBackground({
      eventName: "page_view",
      eventVersion: 1,
      idempotencyKey: `${sessionInternalId}:${activeVisit.routeVisitId}:page_view`,
      metadata: baseMetadata,
    });

    const checkoutIntent = readCheckoutIntent();
    if (
      checkoutIntent &&
      checkoutIntent.sessionInternalId === sessionInternalId &&
      Date.now() - checkoutIntent.startedAtMs >= CHECKOUT_ABANDON_MIN_MS
    ) {
      emitInBackground({
        eventName: "checkout_abandoned",
        eventVersion: 1,
        idempotencyKey: `${checkoutIntent.sessionInternalId}:${checkoutIntent.planId}:checkout_abandoned`,
        metadata: {
          ...baseMetadata,
          routeVisitId: checkoutIntent.routeVisitId,
          checkoutOriginRouteVisitId: checkoutIntent.routeVisitId,
          checkoutStartedAt: new Date(checkoutIntent.startedAtMs).toISOString(),
          planId: checkoutIntent.planId,
        },
      });
      clearCheckoutIntent();
    }

    const startedResult = consumeSessionStartedOnce(
      stateRef.current ?? createJourneyState(),
    );
    stateRef.current = startedResult.state;
    if (startedResult.shouldEmit) {
      emitInBackground({
        eventName: "session_started",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:session_started`,
        metadata: baseMetadata,
      });
    }

    const handleEngagement = () => {
      const engagedResult = consumeSessionEngagedOnce(
        stateRef.current ?? createJourneyState(),
      );
      stateRef.current = engagedResult.state;
      if (!engagedResult.shouldEmit) {
        return;
      }

      emitInBackground({
        eventName: "session_engaged",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:session_engaged`,
        metadata: buildMetadata({
          occurredAt: new Date().toISOString(),
          previousRoute: previousRouteRef.current,
          route: pathnameRef.current,
          routeVisitId:
            stateRef.current.activeRouteVisit?.routeVisitId ??
            activeVisit.routeVisitId,
          sessionInternalId,
        }),
      });
    };

    const emitLeaveFromCurrentVisit = (shouldResetVisit: boolean) => {
      const finished = finishRouteVisitAndReset(
        stateRef.current ?? createJourneyState(),
        {
          finishedAtMs: Date.now(),
        },
      );

      if (shouldResetVisit) {
        stateRef.current = finished.state;
      }

      if (!finished.event) {
        return;
      }

      if (emittedLeaveVisitIdsRef.current.has(finished.event.routeVisitId)) {
        return;
      }

      emittedLeaveVisitIdsRef.current.add(finished.event.routeVisitId);

      const leavePayload = {
        eventName: "page_leave",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${finished.event.routeVisitId}:page_leave`,
        metadata: buildMetadata({
          occurredAt: new Date().toISOString(),
          previousRoute: previousRouteRef.current,
          route: finished.event.pathname,
          routeVisitId: finished.event.routeVisitId,
          sessionInternalId,
          timeOnPageMs: finished.event.timeOnPageMs,
        }),
      };

      tryEmitWithBeacon(leavePayload);
      emitInBackground(leavePayload);

      if (shouldResetVisit) {
        previousRouteRef.current = finished.event.pathname;
        setPreviousRoute(finished.event.pathname);
        clearCurrentRouteVisitId();
      }
    };

    const handlePageHide = () => {
      emitLeaveFromCurrentVisit(true);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("click", handleEngagement, { once: true });
    window.addEventListener("keydown", handleEngagement, { once: true });

    return () => {
      emitLeaveFromCurrentVisit(true);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("click", handleEngagement);
      window.removeEventListener("keydown", handleEngagement);
    };
  }, [pathname]);

  return children;
}
