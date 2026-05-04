"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
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
const CURRENT_ROUTE_VISIT_SNAPSHOT_KEY = "journey_current_route_visit_snapshot";
const PREVIOUS_ROUTE_KEY = "journey_previous_route";
const SITE_EXIT_EMITTED_SESSION_KEY = "journey_site_exit_emitted_session";

type CheckoutIntentMarker = {
  planId: string;
  routeVisitId: string;
  sessionInternalId: string;
  startedAtMs: number;
};

type RouteVisitSnapshot = {
  pathname: string;
  routeVisitId: string;
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
  void trackEvent({
    eventName: payload.eventName,
    eventVersion: payload.eventVersion,
    idempotencyKey: payload.idempotencyKey,
    properties: payload.metadata,
  }).catch((error) => {
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

  const body = JSON.stringify({
    eventName: payload.eventName,
    eventVersion: payload.eventVersion,
    idempotencyKey: payload.idempotencyKey,
    metadata: payload.metadata,
  });

  return navigator.sendBeacon(
    "/api/analysis-observability/business-funnel-events",
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

function setCurrentRouteVisitSnapshot(snapshot: RouteVisitSnapshot) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(
    CURRENT_ROUTE_VISIT_SNAPSHOT_KEY,
    JSON.stringify(snapshot),
  );
}

function readCurrentRouteVisitSnapshot(): RouteVisitSnapshot | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(CURRENT_ROUTE_VISIT_SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RouteVisitSnapshot>;
    if (
      typeof parsed.pathname !== "string" ||
      typeof parsed.routeVisitId !== "string" ||
      typeof parsed.startedAtMs !== "number"
    ) {
      return null;
    }

    return {
      pathname: parsed.pathname,
      routeVisitId: parsed.routeVisitId,
      startedAtMs: parsed.startedAtMs,
    };
  } catch {
    return null;
  }
}

function clearCurrentRouteVisitId() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.removeItem(CURRENT_ROUTE_VISIT_KEY);
  sessionStorage.removeItem(CURRENT_ROUTE_VISIT_SNAPSHOT_KEY);
}

function setPreviousRoute(pathname: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(PREVIOUS_ROUTE_KEY, pathname);
}

function hasSiteExitBeenEmittedForSession(sessionInternalId: string): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  return (
    sessionStorage.getItem(SITE_EXIT_EMITTED_SESSION_KEY) === sessionInternalId
  );
}

function markSiteExitEmittedForSession(sessionInternalId: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(SITE_EXIT_EMITTED_SESSION_KEY, sessionInternalId);
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
    const sessionInternalId = getSessionInternalId();
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

    const previousActiveVisit = stateRef.current?.activeRouteVisit;
    if (previousActiveVisit && previousActiveVisit.pathname !== pathname) {
      emitLeaveFromCurrentVisit(true);
    }

    if (!previousActiveVisit) {
      const snapshotVisit = readCurrentRouteVisitSnapshot();
      if (snapshotVisit && snapshotVisit.pathname !== pathname) {
        const leavePayload = {
          eventName: "page_leave",
          eventVersion: 1,
          idempotencyKey: `${sessionInternalId}:${snapshotVisit.routeVisitId}:page_leave`,
          metadata: buildMetadata({
            occurredAt: new Date().toISOString(),
            previousRoute: previousRouteRef.current,
            route: snapshotVisit.pathname,
            routeVisitId: snapshotVisit.routeVisitId,
            sessionInternalId,
            timeOnPageMs: Math.max(0, Date.now() - snapshotVisit.startedAtMs),
          }),
        };

        tryEmitWithBeacon(leavePayload);
        emitInBackground(leavePayload);

        previousRouteRef.current = snapshotVisit.pathname;
        setPreviousRoute(snapshotVisit.pathname);
        clearCurrentRouteVisitId();
      }
    }

    if (!isJourneyRouteEligible(pathname)) {
      return;
    }

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

    const hasActiveVisitForPath =
      stateRef.current?.activeRouteVisit?.pathname === pathname;

    if (!hasActiveVisitForPath) {
      stateRef.current = startRouteVisit(
        stateRef.current ?? createJourneyState(),
        {
          pathname,
          startedAtMs: Date.now(),
        },
      );
    }

    const activeVisit = stateRef.current?.activeRouteVisit;
    if (!activeVisit) {
      return;
    }

    setCurrentRouteVisitId(activeVisit.routeVisitId);
    setCurrentRouteVisitSnapshot({
      pathname,
      routeVisitId: activeVisit.routeVisitId,
      startedAtMs: activeVisit.startedAtMs,
    });

    if (!hasActiveVisitForPath) {
      const occurredAt = new Date().toISOString();
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
            checkoutStartedAt: new Date(
              checkoutIntent.startedAtMs,
            ).toISOString(),
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

    const handlePageHide = () => {
      const activeVisit = stateRef.current?.activeRouteVisit;
      if (activeVisit && !hasSiteExitBeenEmittedForSession(sessionInternalId)) {
        const siteExitPayload = {
          eventName: "site_exit",
          eventVersion: 1,
          idempotencyKey: `${sessionInternalId}:${activeVisit.routeVisitId}:site_exit`,
          metadata: buildMetadata({
            occurredAt: new Date().toISOString(),
            previousRoute: previousRouteRef.current,
            route: activeVisit.pathname,
            routeVisitId: activeVisit.routeVisitId,
            sessionInternalId,
            timeOnPageMs: Math.max(0, Date.now() - activeVisit.startedAtMs),
          }),
        };

        tryEmitWithBeacon(siteExitPayload);
        emitInBackground(siteExitPayload);
        markSiteExitEmittedForSession(sessionInternalId);
      }

      emitLeaveFromCurrentVisit(true);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("click", handleEngagement, { once: true });
    window.addEventListener("keydown", handleEngagement, { once: true });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("click", handleEngagement);
      window.removeEventListener("keydown", handleEngagement);
    };
  }, [pathname]);

  return children;
}
