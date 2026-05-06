"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import { persistPosthogSessionId } from "@/lib/posthog-session";

const AUTH_ANALYTICS_STORAGE_KEY = "analytics_auth_context";
const IDENTIFIED_USER_STORAGE_KEY = "posthog_identified_user_id";
const AUTH_SESSION_IDENTIFIED_STORAGE_KEY =
  "analytics_auth_session_identified_user_id";
const JOURNEY_SESSION_KEY = "journey_session_internal_id";

type SessionPayload = {
  authenticated: boolean;
  user?: {
    email?: string;
    id: string;
    name?: string;
  };
};

async function loadPosthogClient() {
  const module = await import("posthog-js");
  return module.default;
}

type PosthogSessionClient = {
  get_session_id?: () => string | null | undefined;
  onSessionId?: (callback: (sessionId: string) => void) => void;
};

function writeAuthAnalyticsContext(input: {
  isAuthenticated: boolean;
  userId: string | null;
}) {
  sessionStorage.setItem(AUTH_ANALYTICS_STORAGE_KEY, JSON.stringify(input));
}

function clearAuthAnalyticsContext() {
  sessionStorage.removeItem(AUTH_ANALYTICS_STORAGE_KEY);
  sessionStorage.removeItem(IDENTIFIED_USER_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_SESSION_IDENTIFIED_STORAGE_KEY);
}

type AuthState = "anonymous" | "authenticated" | "unknown";

function readAuthState(): AuthState {
  const raw = sessionStorage.getItem(AUTH_ANALYTICS_STORAGE_KEY);
  if (!raw) {
    return "unknown";
  }

  try {
    const parsed = JSON.parse(raw) as {
      isAuthenticated?: boolean;
      userId?: string | null;
    };
    if (parsed.isAuthenticated && typeof parsed.userId === "string") {
      return "authenticated";
    }

    return "anonymous";
  } catch {
    return "unknown";
  }
}

function getPosthogConfig() {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  const uiHost = process.env.NEXT_PUBLIC_POSTHOG_UIHOST?.trim() || undefined;

  return { apiHost, apiKey, uiHost };
}

function getJourneySessionInternalId() {
  if (typeof sessionStorage === "undefined") {
    return "unknown-session";
  }

  return sessionStorage.getItem(JOURNEY_SESSION_KEY) ?? "unknown-session";
}

export function PosthogAuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initializedRef = useRef(false);
  const lastIdentifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const posthogConfig = getPosthogConfig();
      let posthog: Awaited<ReturnType<typeof loadPosthogClient>> | null = null;
      if (posthogConfig) {
        posthog = await loadPosthogClient();
        if (cancelled) {
          return;
        }

        if (!initializedRef.current) {
          posthog.init(posthogConfig.apiKey, {
            api_host: posthogConfig.apiHost,
            ui_host: posthogConfig.uiHost,
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_performance: false,
            person_profiles: "identified_only",
          });
          initializedRef.current = true;
        }

        const posthogSessionClient = posthog as unknown as PosthogSessionClient;
        persistPosthogSessionId(posthogSessionClient.get_session_id?.());
        posthogSessionClient.onSessionId?.((sessionId) => {
          persistPosthogSessionId(sessionId);
        });
      }

      if (typeof fetch !== "function") {
        writeAuthAnalyticsContext({
          isAuthenticated: false,
          userId: null,
        });
        return;
      }

      const response = await fetch("/api/session", {
        cache: "no-store",
        credentials: "same-origin",
      }).catch(() => null);

      if (!response?.ok) {
        if (!cancelled) {
          writeAuthAnalyticsContext({
            isAuthenticated: false,
            userId: null,
          });
        }
        return;
      }

      const payload = (await response
        .json()
        .catch(() => null)) as SessionPayload | null;

      if (cancelled || !payload) {
        return;
      }

      const userId =
        payload.authenticated &&
        payload.user &&
        typeof payload.user.id === "string"
          ? payload.user.id
          : null;

      const previousAuthState = readAuthState();

      writeAuthAnalyticsContext({
        isAuthenticated: Boolean(userId),
        userId,
      });

      if (userId) {
        const shouldEmitAuthSessionIdentified =
          previousAuthState === "anonymous" || previousAuthState === "unknown";

        if (shouldEmitAuthSessionIdentified) {
          const posthogSessionClient = posthog as
            | PosthogSessionClient
            | null;
          persistPosthogSessionId(posthogSessionClient?.get_session_id?.());

          const journeySessionInternalId = getJourneySessionInternalId();
          void trackEvent({
            eventName: "auth_session_identified",
            eventVersion: 1,
            idempotencyKey: `auth_session_identified:${journeySessionInternalId}:${userId}:${Date.now()}`,
            properties: {
              isAuthenticated: true,
              userId,
              user_id: userId,
              identified_user_id: userId,
              auth_provider: undefined,
              auth_flow: undefined,
              previous_auth_state: previousAuthState,
              source_detail: "posthog_auth_provider",
            },
          });
          sessionStorage.setItem(AUTH_SESSION_IDENTIFIED_STORAGE_KEY, userId);
        }
      }

      const storedIdentifiedUserId = sessionStorage.getItem(
        IDENTIFIED_USER_STORAGE_KEY,
      );
      const storedAuthIdentifiedUserId = sessionStorage.getItem(
        AUTH_SESSION_IDENTIFIED_STORAGE_KEY,
      );

      if (!userId) {
        if (
          storedIdentifiedUserId ||
          storedAuthIdentifiedUserId ||
          lastIdentifiedUserIdRef.current ||
          previousAuthState === "authenticated"
        ) {
          posthog?.reset();
          clearAuthAnalyticsContext();
          writeAuthAnalyticsContext({ isAuthenticated: false, userId: null });
          lastIdentifiedUserIdRef.current = null;
        }
        return;
      }

      const alreadyIdentified =
        lastIdentifiedUserIdRef.current === userId ||
        storedIdentifiedUserId === userId;

      if (!alreadyIdentified && posthog) {
        posthog.identify(userId, {
          ...(typeof payload.user?.email === "string"
            ? { email: payload.user.email }
            : {}),
          ...(typeof payload.user?.name === "string"
            ? { name: payload.user.name }
            : {}),
        });
      }

      lastIdentifiedUserIdRef.current = userId;
      sessionStorage.setItem(IDENTIFIED_USER_STORAGE_KEY, userId);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return children;
}
