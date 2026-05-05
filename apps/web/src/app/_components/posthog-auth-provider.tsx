"use client";

import { useEffect, useRef } from "react";

const AUTH_ANALYTICS_STORAGE_KEY = "analytics_auth_context";
const IDENTIFIED_USER_STORAGE_KEY = "posthog_identified_user_id";

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

function writeAuthAnalyticsContext(input: {
  isAuthenticated: boolean;
  userId: string | null;
}) {
  sessionStorage.setItem(AUTH_ANALYTICS_STORAGE_KEY, JSON.stringify(input));
}

function clearAuthAnalyticsContext() {
  sessionStorage.removeItem(AUTH_ANALYTICS_STORAGE_KEY);
  sessionStorage.removeItem(IDENTIFIED_USER_STORAGE_KEY);
}

function getPosthogConfig() {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

  return { apiHost, apiKey };
}

export function PosthogAuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initializedRef = useRef(false);
  const lastIdentifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
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

      if (!response || !response.ok) {
        if (!cancelled) {
          writeAuthAnalyticsContext({
            isAuthenticated: false,
            userId: null,
          });
        }
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | SessionPayload
        | null;

      if (cancelled || !payload) {
        return;
      }

      const userId =
        payload.authenticated && payload.user && typeof payload.user.id === "string"
          ? payload.user.id
          : null;

      writeAuthAnalyticsContext({
        isAuthenticated: Boolean(userId),
        userId,
      });

      const posthogConfig = getPosthogConfig();
      if (!posthogConfig) {
        return;
      }

      const posthog = await loadPosthogClient();
      if (cancelled) {
        return;
      }

      if (!initializedRef.current) {
        posthog.init(posthogConfig.apiKey, {
          api_host: posthogConfig.apiHost,
          person_profiles: "identified_only",
        });
        initializedRef.current = true;
      }

      const storedIdentifiedUserId = sessionStorage.getItem(
        IDENTIFIED_USER_STORAGE_KEY,
      );

      if (!userId) {
        if (storedIdentifiedUserId || lastIdentifiedUserIdRef.current) {
          posthog.reset();
          clearAuthAnalyticsContext();
          writeAuthAnalyticsContext({ isAuthenticated: false, userId: null });
          lastIdentifiedUserIdRef.current = null;
        }
        return;
      }

      const alreadyIdentified =
        lastIdentifiedUserIdRef.current === userId || storedIdentifiedUserId === userId;

      if (!alreadyIdentified) {
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
