export type CheckoutIntentMarker = {
  pathname: string;
  planSlug: string;
  startedAtMs: number;
};

type RouteVisit = {
  pathname: string;
  routeVisitId: string;
  startedAtMs: number;
};

export type JourneyState = {
  activeRouteVisit: RouteVisit | null;
  checkoutAbandonmentKeys: ReadonlySet<string>;
  hasEmittedSessionEngaged: boolean;
  hasEmittedSessionStarted: boolean;
  routeVisitSequence: number;
};

type RouteVisitStartInput = {
  pathname: string;
  startedAtMs: number;
};

type RouteVisitFinishInput = {
  finishedAtMs: number;
};

type RouteVisitFinished = {
  pathname: string;
  routeVisitId: string;
  timeOnPageMs: number;
};

type RouteVisitFinishResult = {
  event: RouteVisitFinished | null;
  state: JourneyState;
};

type OneShotResult = {
  shouldEmit: boolean;
  state: JourneyState;
};

type CheckoutAbandonmentResult = OneShotResult & {
  key: string;
};

const CHECKOUT_ABANDONMENT_MIN_MS = 60_000;

export function isJourneyRouteEligible(pathname: string): boolean {
  return !(
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/superadmin" ||
    pathname.startsWith("/superadmin/")
  );
}

export function createJourneyState(): JourneyState {
  return {
    activeRouteVisit: null,
    checkoutAbandonmentKeys: new Set<string>(),
    hasEmittedSessionEngaged: false,
    hasEmittedSessionStarted: false,
    routeVisitSequence: 0,
  };
}

export function startRouteVisit(
  state: JourneyState,
  input: RouteVisitStartInput,
): JourneyState {
  const nextSequence = state.routeVisitSequence + 1;
  return {
    ...state,
    activeRouteVisit: {
      pathname: input.pathname,
      routeVisitId: buildRouteVisitId(
        input.pathname,
        input.startedAtMs,
        nextSequence,
      ),
      startedAtMs: input.startedAtMs,
    },
    routeVisitSequence: nextSequence,
  };
}

export function finishRouteVisit(
  state: JourneyState,
  input: RouteVisitFinishInput,
): RouteVisitFinished | null {
  return finishRouteVisitAndReset(state, input).event;
}

export function finishRouteVisitAndReset(
  state: JourneyState,
  input: RouteVisitFinishInput,
): RouteVisitFinishResult {
  if (!state.activeRouteVisit) {
    return {
      event: null,
      state,
    };
  }

  return {
    event: {
      pathname: state.activeRouteVisit.pathname,
      routeVisitId: state.activeRouteVisit.routeVisitId,
      timeOnPageMs: Math.max(
        0,
        input.finishedAtMs - state.activeRouteVisit.startedAtMs,
      ),
    },
    state: {
      ...state,
      activeRouteVisit: null,
    },
  };
}

export function consumeSessionStartedOnce(state: JourneyState): OneShotResult {
  if (state.hasEmittedSessionStarted) {
    return {
      shouldEmit: false,
      state,
    };
  }

  return {
    shouldEmit: true,
    state: {
      ...state,
      hasEmittedSessionStarted: true,
    },
  };
}

export function consumeSessionEngagedOnce(state: JourneyState): OneShotResult {
  if (state.hasEmittedSessionEngaged) {
    return {
      shouldEmit: false,
      state,
    };
  }

  return {
    shouldEmit: true,
    state: {
      ...state,
      hasEmittedSessionEngaged: true,
    },
  };
}

export function buildCheckoutAbandonmentKey(
  marker: CheckoutIntentMarker,
): string {
  return `${marker.pathname}::${marker.planSlug}::${marker.startedAtMs}`;
}

export function evaluateCheckoutAbandonment(
  state: JourneyState,
  marker: CheckoutIntentMarker,
  nowMs: number,
): CheckoutAbandonmentResult {
  const key = buildCheckoutAbandonmentKey(marker);
  const hasWaitedEnough =
    nowMs - marker.startedAtMs >= CHECKOUT_ABANDONMENT_MIN_MS;
  const hasAlreadyEmitted = state.checkoutAbandonmentKeys.has(key);

  if (!hasWaitedEnough || hasAlreadyEmitted) {
    return {
      key,
      shouldEmit: false,
      state,
    };
  }

  return {
    key,
    shouldEmit: true,
    state: {
      ...state,
      checkoutAbandonmentKeys: new Set<string>([
        ...state.checkoutAbandonmentKeys,
        key,
      ]),
    },
  };
}

function buildRouteVisitId(
  pathname: string,
  startedAtMs: number,
  routeVisitSequence: number,
): string {
  return `${pathname}::${startedAtMs}::${routeVisitSequence}`;
}
