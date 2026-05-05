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
  amount?: number;
  credits?: number;
  currency?: string;
  pathname: string;
  planName?: string;
  planId: string;
  route: string;
  routeVisitId: string;
  search: string;
  sessionInternalId: string;
  startedAtMs: number;
  url: string;
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
  | "auth_redirect"
  | "auth_submit"
  | "pagehide"
  | "visibility_hidden"
  | "beforeunload"
  | "unknown";

type PendingNavigation = {
  authFlow?: "signin" | "signup" | "unknown";
  authMethod?: "email_password" | "oauth";
  isAuthSubmit?: boolean;
  isAuthRedirect: boolean;
  nextPathname?: string;
  nextRoute?: string;
  nextSearch?: string;
  nextUrl?: string;
};

function parseCurrencyAmount(input: unknown): number | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const compact = input.trim().replace(/\s+/g, "").replace("R$", "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;

  if (!normalized) {
    return undefined;
  }

  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return amount;
}

function parseCredits(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input !== "string") {
    return undefined;
  }

  const match = input.match(/\d+/);
  if (!match) {
    return undefined;
  }

  const credits = Number.parseInt(match[0], 10);
  return Number.isFinite(credits) ? credits : undefined;
}

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

function getAuthContext() {
  if (typeof sessionStorage === "undefined") {
    return { isAuthenticated: false, userId: null as string | null };
  }

  const raw = sessionStorage.getItem("analytics_auth_context");
  if (!raw) {
    return { isAuthenticated: false, userId: null as string | null };
  }

  try {
    const parsed = JSON.parse(raw) as {
      isAuthenticated?: boolean;
      userId?: string | null;
    };
    const userId = typeof parsed.userId === "string" ? parsed.userId : null;
    return {
      isAuthenticated: Boolean(parsed.isAuthenticated && userId),
      userId,
    };
  } catch {
    return { isAuthenticated: false, userId: null as string | null };
  }
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
  const auth = getAuthContext();

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
    isAuthenticated: auth.isAuthenticated,
    userId: auth.userId,
    user_id: auth.userId,
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
      typeof parsed.pathname !== "string" ||
      typeof parsed.planId !== "string" ||
      typeof parsed.route !== "string" ||
      typeof parsed.routeVisitId !== "string" ||
      typeof parsed.search !== "string" ||
      typeof parsed.sessionInternalId !== "string" ||
      typeof parsed.startedAtMs !== "number" ||
      typeof parsed.url !== "string"
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
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);

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
      const route = pathnameRef.current;
      const authFlow =
        route === "/entrar"
          ? new URLSearchParams(window.location.search).get("tab") ===
            "cadastro"
            ? "signup"
            : "signin"
          : "unknown";
      const isGoogleOauthLink =
        nextUrl.pathname.includes("/auth/google/start") ||
        nextUrl.pathname.includes("/oauth/google");

      if (isGoogleOauthLink) {
        const sessionInternalId = getSessionInternalId();
        const routeVisitId = stateRef.current?.activeRouteVisit?.routeVisitId;

        pendingNavigationRef.current = {
          isAuthRedirect: true,
          nextUrl: nextUrl.href,
        };

        emitInBackground({
          eventName: "auth_oauth_redirect_started",
          eventVersion: 1,
          idempotencyKey: `${sessionInternalId}:${routeVisitId ?? "unknown"}:auth_oauth_redirect_started:google`,
          metadata: {
            ...buildMetadata({
              occurredAt: new Date().toISOString(),
              previousRoute: previousRouteRef.current,
              route,
              url: window.location.href,
              pathname: window.location.pathname,
              search: window.location.search,
              referrer: document.referrer,
              routeVisitId: routeVisitId ?? "unknown",
              sessionInternalId,
            }),
            provider: "google",
            auth_provider_domain: "accounts.google.com",
            source_detail: "login_google",
            auth_flow: authFlow,
            next_external_domain: nextUrl.hostname || undefined,
          },
        });

        return;
      }

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      markInternalNavigation();
      pendingNavigationRef.current = {
        isAuthRedirect: false,
        nextPathname: nextUrl.pathname,
        nextRoute: nextUrl.pathname,
        nextSearch: nextUrl.search,
        nextUrl: nextUrl.href,
      };
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
      const sourceDetailRaw = formData.get("sourceDetail");

      const routeVisitId = stateRef.current?.activeRouteVisit?.routeVisitId;
      if (!routeVisitId) {
        return;
      }

      const occurredAt = new Date().toISOString();
      const route = pathnameRef.current;
      const sessionInternalId = getSessionInternalId();
      const amount = parseCurrencyAmount(planPriceRaw);
      const credits = parseCredits(planCreditsRaw);
      const planId = String(planIdRaw).trim();
      const planName =
        typeof planNameRaw === "string" && planNameRaw.trim().length > 0
          ? planNameRaw.trim()
          : undefined;
      const sourceDetail =
        typeof sourceDetailRaw === "string" && sourceDetailRaw.trim().length > 0
          ? sourceDetailRaw.trim()
          : undefined;
      const currency =
        typeof planCurrencyRaw === "string" && planCurrencyRaw.trim().length > 0
          ? planCurrencyRaw.trim().toUpperCase()
          : "BRL";

      const planEventMetadata = {
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
        amount,
        credits,
        currency,
        planId,
        planName,
        provider: "mercado_pago",
        source_detail: sourceDetail,
      };

      emitInBackground({
        eventName: "plan_selected",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${routeVisitId}:plan_selected:${planId}`,
        metadata: planEventMetadata,
      });

      emitInBackground({
        eventName: "checkout_started",
        eventVersion: 1,
        idempotencyKey: `${sessionInternalId}:${routeVisitId}:checkout_started:${planId}`,
        metadata: {
          ...planEventMetadata,
          external_reference:
            typeof adaptationIdRaw === "string" ? adaptationIdRaw : undefined,
          payment_method: "unknown",
        },
      });

      writeCheckoutIntent({
        amount,
        credits,
        currency,
        pathname: window.location.pathname,
        planName,
        planId: planIdRaw.trim(),
        route,
        routeVisitId,
        search: window.location.search,
        sessionInternalId,
        startedAtMs: Date.now(),
        url: window.location.href,
      });
    };

    const handleAuthSubmit = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) {
        return;
      }

      const action = target.getAttribute("action") ?? "";
      if (action !== "/auth/login-user" && action !== "/auth/login") {
        return;
      }

      const formData = new FormData(target);
      const nextRaw = formData.get("next");
      const next =
        typeof nextRaw === "string" &&
        nextRaw.startsWith("/") &&
        !nextRaw.startsWith("//")
          ? nextRaw
          : undefined;
      const nextUrl = next ? `${window.location.origin}${next}` : undefined;
      const nextSearch = nextUrl ? new URL(nextUrl).search : undefined;
      const authFlow =
        new URLSearchParams(window.location.search).get("tab") === "cadastro"
          ? "signup"
          : "signin";

      internalNavigationInProgressRef.current = true;
      pendingNavigationRef.current = {
        authFlow,
        authMethod: "email_password",
        isAuthRedirect: false,
        isAuthSubmit: true,
        nextPathname: next,
        nextRoute: next,
        nextSearch,
        nextUrl,
      };
    };

    document.addEventListener("submit", handleCheckoutIntentSubmit, true);
    document.addEventListener("submit", handleAuthSubmit, true);

    return () => {
      document.removeEventListener("submit", handleCheckoutIntentSubmit, true);
      document.removeEventListener("submit", handleAuthSubmit, true);
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

      const entryRoute =
        routeVisitSnapshot?.entryRoute ?? finished.event.pathname;
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
            amount: checkoutIntent.amount,
            checkoutOriginPathname: checkoutIntent.pathname,
            checkoutOriginRoute: checkoutIntent.route,
            checkoutOriginRouteVisitId: checkoutIntent.routeVisitId,
            checkoutOriginSearch: checkoutIntent.search,
            checkoutOriginUrl: checkoutIntent.url,
            checkoutStartedAt: new Date(
              checkoutIntent.startedAtMs,
            ).toISOString(),
            credits: checkoutIntent.credits,
            currency: checkoutIntent.currency,
            planId: checkoutIntent.planId,
            planName: checkoutIntent.planName,
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
        pendingNavigationRef.current?.isAuthSubmit ||
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
      const pendingNavigation = pendingNavigationRef.current;
      if (!pendingNavigation?.isAuthRedirect && !pendingNavigation?.isAuthSubmit) {
        emitSiteExitCandidate("pagehide");
      }

      const leaveReason: LeaveReason = pendingNavigation?.isAuthSubmit
        ? "auth_submit"
        : pendingNavigation?.isAuthRedirect
          ? "auth_redirect"
          : pendingNavigation?.nextPathname
            ? "route_change"
            : "pagehide";

      emitLeaveFromCurrentVisit({
        leaveReason,
        nextPathname: pendingNavigation?.nextPathname,
        nextRoute: pendingNavigation?.nextRoute,
        nextSearch: pendingNavigation?.nextSearch,
        nextUrl: pendingNavigation?.nextUrl,
        shouldResetVisit: true,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") {
        return;
      }

      if (pendingNavigationRef.current?.isAuthSubmit) {
        return;
      }

      emitSiteExitCandidate("visibility_hidden");
    };

    const handleBeforeUnload = () => {
      const pendingNavigation = pendingNavigationRef.current;
      if (pendingNavigation?.isAuthRedirect || pendingNavigation?.isAuthSubmit) {
        return;
      }

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
