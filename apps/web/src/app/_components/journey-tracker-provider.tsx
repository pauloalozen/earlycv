"use client";

import { usePathname, useSearchParams } from "next/navigation";
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
const SITE_EXIT_CANDIDATE_EMITTED_SESSION_KEY =
  "journey_site_exit_candidate_emitted_session";

type CheckoutIntentMarker = {
  planId: string;
  routeVisitId: string;
  sessionInternalId: string;
  startedAtMs: number;
};

type RouteVisitSnapshot = {
  entryPathname: string;
  entryRoute: string;
  entrySearch: string;
  entryUrl: string;
  referrer: string;
  previousRoute: string | null;
  routeVisitId: string;
  startedAtMs: number;
};

type LeaveReason =
  | "route_change"
  | "pagehide"
  | "visibility_hidden"
  | "beforeunload"
  | "unknown";

function resolveAnalyticsEnv(): "production" | "staging" | "development" {
  const candidate =
    process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() ??
    process.env.NODE_ENV?.trim().toLowerCase() ??
    "development";

  if (candidate === "production") {
    return "production";
  }

  if (candidate === "staging" || candidate === "preview") {
    return "staging";
  }

  return "development";
}

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
  url: string;
  pathname: string;
  search: string;
  referrer: string;
  routeVisitId: string;
  sessionInternalId: string;
  nextRoute?: string;
  nextUrl?: string;
  nextPathname?: string;
  nextSearch?: string;
  leaveReason?: LeaveReason;
  timeOnPageMs?: number;
}) {
  return {
    app: "earlycv",
    env: resolveAnalyticsEnv(),
    occurredAt: input.occurredAt,
    previous_route: input.previousRoute,
    source: "frontend",
    route: input.route,
    url: input.url,
    pathname: input.pathname,
    search: input.search,
    referrer: input.referrer,
    routeVisitId: input.routeVisitId,
    sessionInternalId: input.sessionInternalId,
    next_route: input.nextRoute,
    next_url: input.nextUrl,
    next_pathname: input.nextPathname,
    next_search: input.nextSearch,
    leave_reason: input.leaveReason,
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
      typeof parsed.entryPathname !== "string" ||
      typeof parsed.entryRoute !== "string" ||
      typeof parsed.entrySearch !== "string" ||
      typeof parsed.entryUrl !== "string" ||
      typeof parsed.referrer !== "string" ||
      typeof parsed.routeVisitId !== "string" ||
      typeof parsed.startedAtMs !== "number"
    ) {
      return null;
    }

    return {
      entryPathname: parsed.entryPathname,
      entryRoute: parsed.entryRoute,
      entrySearch: parsed.entrySearch,
      entryUrl: parsed.entryUrl,
      referrer: parsed.referrer,
      previousRoute:
        typeof parsed.previousRoute === "string" ? parsed.previousRoute : null,
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

function hasSiteExitCandidateBeenEmittedForSession(
  sessionInternalId: string,
): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  return (
    sessionStorage.getItem(SITE_EXIT_CANDIDATE_EMITTED_SESSION_KEY) ===
    sessionInternalId
  );
}

function markSiteExitCandidateEmittedForSession(sessionInternalId: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(
    SITE_EXIT_CANDIDATE_EMITTED_SESSION_KEY,
    sessionInternalId,
  );
}

export function JourneyTrackerProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const stateRef = useRef<JourneyState | null>(null);
  const previousRouteRef = useRef<string | null>(null);
  const pathnameRef = useRef<string>(pathname);
  const emittedLeaveVisitIdsRef = useRef<Set<string>>(new Set<string>());
  const internalNavigationInProgressRef = useRef<boolean>(false);
  const internalNavigationResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const markInternalNavigation = () => {
      internalNavigationInProgressRef.current = true;

      if (internalNavigationResetTimeoutRef.current !== null) {
        window.clearTimeout(internalNavigationResetTimeoutRef.current);
      }

      internalNavigationResetTimeoutRef.current = window.setTimeout(() => {
        internalNavigationInProgressRef.current = false;
        internalNavigationResetTimeoutRef.current = null;
      }, 1200);
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      markInternalNavigation();
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);

      if (internalNavigationResetTimeoutRef.current !== null) {
        window.clearTimeout(internalNavigationResetTimeoutRef.current);
      }
    };
  }, []);

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

      const planNameRaw = formData.get("planName");
      const planCreditsRaw = formData.get("planCredits");
      const planPriceRaw = formData.get("planPrice");
      const planCurrencyRaw = formData.get("planCurrency");
      const adaptationIdRaw = formData.get("adaptationId");

      const routeVisitId = stateRef.current?.activeRouteVisit?.routeVisitId;
      if (!routeVisitId) {
        return;
      }

      const occurredAt = new Date().toISOString();
      const route = pathnameRef.current;
      const sessionInternalId = getSessionInternalId();

      emitInBackground({
        eventName: "plan_selected",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${routeVisitId}:plan_selected:${String(planIdRaw).trim()}`,
        metadata: buildMetadata({
          occurredAt,
          previousRoute: previousRouteRef.current,
          route,
          url: window.location.href,
          pathname: window.location.pathname,
          search: window.location.search,
          referrer: document.referrer,
          routeVisitId,
          sessionInternalId,
        }),
      });

      emitInBackground({
        eventName: "checkout_started",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${routeVisitId}:checkout_started:${String(planIdRaw).trim()}`,
        metadata: {
          ...buildMetadata({
            occurredAt,
            previousRoute: previousRouteRef.current,
            route,
            url: window.location.href,
            pathname: window.location.pathname,
            search: window.location.search,
            referrer: document.referrer,
            routeVisitId,
            sessionInternalId,
          }),
          amount: typeof planPriceRaw === "string" ? planPriceRaw : undefined,
          credits:
            typeof planCreditsRaw === "string" ? planCreditsRaw : undefined,
          currency:
            typeof planCurrencyRaw === "string" ? planCurrencyRaw : "BRL",
          external_reference:
            typeof adaptationIdRaw === "string" ? adaptationIdRaw : undefined,
          payment_method: "unknown",
          planId: String(planIdRaw).trim(),
          planName:
            typeof planNameRaw === "string" ? planNameRaw : undefined,
          provider: "mercado_pago",
        },
      });

      writeCheckoutIntent({
        planId: planIdRaw.trim(),
        routeVisitId,
        sessionInternalId,
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
    const currentSearch = search ? `?${search}` : "";
    const currentUrl = `${window.location.origin}${pathname}${currentSearch}`;

    const emitLeaveFromCurrentVisit = (input: {
      leaveReason: LeaveReason;
      nextPathname?: string;
      nextRoute?: string;
      nextSearch?: string;
      nextUrl?: string;
      shouldResetVisit: boolean;
    }) => {
      const finished = finishRouteVisitAndReset(
        stateRef.current ?? createJourneyState(),
        {
          finishedAtMs: Date.now(),
        },
      );

      if (input.shouldResetVisit) {
        stateRef.current = finished.state;
      }

      if (!finished.event) {
        return;
      }

      if (emittedLeaveVisitIdsRef.current.has(finished.event.routeVisitId)) {
        return;
      }

      emittedLeaveVisitIdsRef.current.add(finished.event.routeVisitId);

      const snapshot = readCurrentRouteVisitSnapshot();
      const routeVisitSnapshot =
        snapshot && snapshot.routeVisitId === finished.event.routeVisitId
          ? snapshot
          : null;

      const entryRoute = routeVisitSnapshot?.entryRoute ?? finished.event.pathname;
      const entryPathname =
        routeVisitSnapshot?.entryPathname ?? finished.event.pathname;
      const entrySearch = routeVisitSnapshot?.entrySearch ?? "";
      const entryUrl =
        routeVisitSnapshot?.entryUrl ??
        `${window.location.origin}${entryPathname}${entrySearch}`;
      const entryReferrer = routeVisitSnapshot?.referrer ?? document.referrer;

      const leavePayload = {
        eventName: "page_leave",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${finished.event.routeVisitId}:page_leave`,
        metadata: buildMetadata({
          occurredAt: new Date().toISOString(),
          previousRoute:
            routeVisitSnapshot?.previousRoute ?? previousRouteRef.current,
          route: entryRoute,
          url: entryUrl,
          pathname: entryPathname,
          search: entrySearch,
          referrer: entryReferrer,
          routeVisitId: finished.event.routeVisitId,
          sessionInternalId,
          nextPathname: input.nextPathname,
          nextRoute: input.nextRoute,
          nextSearch: input.nextSearch,
          nextUrl: input.nextUrl,
          leaveReason: input.leaveReason,
          timeOnPageMs: finished.event.timeOnPageMs,
        }),
      };

      tryEmitWithBeacon(leavePayload);
      emitInBackground(leavePayload);

      if (input.shouldResetVisit) {
        previousRouteRef.current = finished.event.pathname;
        setPreviousRoute(finished.event.pathname);
        clearCurrentRouteVisitId();
      }
    };

    const previousActiveVisit = stateRef.current?.activeRouteVisit;
    if (previousActiveVisit && previousActiveVisit.pathname !== pathname) {
      internalNavigationInProgressRef.current = true;
      emitLeaveFromCurrentVisit({
        leaveReason: "route_change",
        nextPathname: pathname,
        nextRoute: pathname,
        nextSearch: currentSearch,
        nextUrl: currentUrl,
        shouldResetVisit: true,
      });
    }

    if (!previousActiveVisit) {
      const snapshotVisit = readCurrentRouteVisitSnapshot();
      if (snapshotVisit && snapshotVisit.entryPathname !== pathname) {
        emittedLeaveVisitIdsRef.current.add(snapshotVisit.routeVisitId);

        const leavePayload = {
          eventName: "page_leave",
          eventVersion: 1,
          idempotencyKey: `${sessionInternalId}:${snapshotVisit.routeVisitId}:page_leave`,
          metadata: buildMetadata({
            occurredAt: new Date().toISOString(),
            previousRoute: snapshotVisit.previousRoute,
            route: snapshotVisit.entryRoute,
            url: snapshotVisit.entryUrl,
            pathname: snapshotVisit.entryPathname,
            search: snapshotVisit.entrySearch,
            referrer: snapshotVisit.referrer,
            routeVisitId: snapshotVisit.routeVisitId,
            sessionInternalId,
            nextPathname: pathname,
            nextRoute: pathname,
            nextSearch: currentSearch,
            nextUrl: currentUrl,
            leaveReason: "route_change",
            timeOnPageMs: Math.max(0, Date.now() - snapshotVisit.startedAtMs),
          }),
        };

        tryEmitWithBeacon(leavePayload);
        emitInBackground(leavePayload);

        previousRouteRef.current = snapshotVisit.entryPathname;
        setPreviousRoute(snapshotVisit.entryPathname);
        clearCurrentRouteVisitId();
      }
    }

    if (!isJourneyRouteEligible(pathname)) {
      return;
    }

    const currentSearchParams = new URLSearchParams(window.location.search);

    if (previousRouteRef.current === null) {
      previousRouteRef.current = sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
    }

    if (
      currentSearchParams.get("plan") === "activated" ||
      currentSearchParams.get("error") === "payment_failed"
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
      entryPathname: pathname,
      entryRoute: pathname,
      entrySearch: window.location.search,
      entryUrl: window.location.href,
      referrer: document.referrer,
      previousRoute: previousRouteRef.current,
      routeVisitId: activeVisit.routeVisitId,
      startedAtMs: activeVisit.startedAtMs,
    });

    if (!hasActiveVisitForPath) {
      const occurredAt = new Date().toISOString();
      const baseMetadata = buildMetadata({
        occurredAt,
        previousRoute: previousRouteRef.current,
        route: pathname,
        url: window.location.href,
        pathname,
        search: window.location.search,
        referrer: document.referrer,
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
          url: window.location.href,
          pathname: pathnameRef.current,
          search: window.location.search,
          referrer: document.referrer,
          routeVisitId:
            stateRef.current.activeRouteVisit?.routeVisitId ??
            activeVisit.routeVisitId,
          sessionInternalId,
        }),
      });
    };

    const emitSiteExitCandidate = (leaveReason: LeaveReason) => {
      const activeRouteVisit = stateRef.current?.activeRouteVisit;
      if (
        internalNavigationInProgressRef.current ||
        !activeRouteVisit ||
        hasSiteExitCandidateBeenEmittedForSession(sessionInternalId)
      ) {
        return;
      }

      const snapshot = readCurrentRouteVisitSnapshot();
      const routeVisitSnapshot =
        snapshot && snapshot.routeVisitId === activeRouteVisit.routeVisitId
          ? snapshot
          : null;

      const siteExitPayload = {
        eventName: "site_exit_candidate",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${activeRouteVisit.routeVisitId}:site_exit_candidate`,
        metadata: buildMetadata({
          occurredAt: new Date().toISOString(),
          previousRoute:
            routeVisitSnapshot?.previousRoute ?? previousRouteRef.current,
          route: routeVisitSnapshot?.entryRoute ?? activeRouteVisit.pathname,
          url:
            routeVisitSnapshot?.entryUrl ??
            `${window.location.origin}${activeRouteVisit.pathname}`,
          pathname:
            routeVisitSnapshot?.entryPathname ?? activeRouteVisit.pathname,
          search: routeVisitSnapshot?.entrySearch ?? "",
          referrer: routeVisitSnapshot?.referrer ?? document.referrer,
          routeVisitId: activeRouteVisit.routeVisitId,
          sessionInternalId,
          leaveReason,
          timeOnPageMs: Math.max(0, Date.now() - activeRouteVisit.startedAtMs),
        }),
      };

      tryEmitWithBeacon(siteExitPayload);
      emitInBackground(siteExitPayload);
      markSiteExitCandidateEmittedForSession(sessionInternalId);
    };

    const handlePageHide = () => {
      emitSiteExitCandidate("pagehide");
      emitLeaveFromCurrentVisit({
        leaveReason: "pagehide",
        shouldResetVisit: true,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") {
        return;
      }

      emitSiteExitCandidate("visibility_hidden");
    };

    const handleBeforeUnload = () => {
      emitSiteExitCandidate("beforeunload");
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("click", handleEngagement, { once: true });
    window.addEventListener("keydown", handleEngagement, { once: true });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("click", handleEngagement);
      window.removeEventListener("keydown", handleEngagement);
    };
  }, [pathname, search]);

  return children;
}
