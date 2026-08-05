"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function getTurnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      execution?: "execute" | "render";
      size: "compact" | "flexible" | "normal";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function readTurnstileTokenFromDom() {
  if (typeof document === "undefined") {
    return null;
  }

  const hiddenInput = document.querySelector<HTMLInputElement>(
    'input[name="cf-turnstile-response"]',
  );
  const token = hiddenInput?.value?.trim();

  return token ? token : null;
}

// Extraído de /adaptar (fluxo original de análise) — widget invisível do
// Turnstile compartilhado por qualquer fluxo de análise autenticada
// (também usado pelo botão "Analisar meu CV" em /vagas/[slug]).
export function useTurnstileToken() {
  const turnstileSiteKey = getTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingTokenResolverRef = useRef<
    ((token: string | null) => void) | null
  >(null);
  const [scriptReady, setScriptReady] = useState(false);

  const resolvePendingToken = useCallback((token: string | null) => {
    const resolve = pendingTokenResolverRef.current;
    if (!resolve) {
      return;
    }

    pendingTokenResolverRef.current = null;
    resolve(token);
  }, []);

  const renderInvisibleWidget = useCallback(() => {
    if (!turnstileSiteKey || widgetIdRef.current) {
      return;
    }

    const turnstile = window.turnstile;
    const container = containerRef.current;
    if (!turnstile?.render || !container) {
      return;
    }

    widgetIdRef.current = turnstile.render(container, {
      sitekey: turnstileSiteKey,
      appearance: "execute",
      execution: "execute",
      size: "normal",
      callback: (token) => {
        resolvePendingToken(token.trim() || null);
      },
      "error-callback": () => {
        resolvePendingToken(null);
      },
      "expired-callback": () => {
        resolvePendingToken(null);
      },
    });
  }, [resolvePendingToken, turnstileSiteKey]);

  const requestToken = useCallback(async () => {
    const fallbackToken = readTurnstileTokenFromDom();

    if (!turnstileSiteKey) {
      return fallbackToken;
    }

    const turnstile = window.turnstile;
    if (!turnstile?.execute) {
      return fallbackToken;
    }

    renderInvisibleWidget();

    const widgetId = widgetIdRef.current;
    if (!widgetId) {
      return fallbackToken;
    }

    return new Promise<string | null>((resolve) => {
      const timeoutId = setTimeout(() => {
        pendingTokenResolverRef.current = null;
        resolve(readTurnstileTokenFromDom() ?? null);
      }, 2000);

      pendingTokenResolverRef.current = (token) => {
        clearTimeout(timeoutId);
        resolve(token ?? readTurnstileTokenFromDom() ?? null);
      };

      try {
        turnstile.execute(widgetId);
      } catch {
        clearTimeout(timeoutId);
        pendingTokenResolverRef.current = null;
        resolve(fallbackToken);
      }
    });
  }, [renderInvisibleWidget, turnstileSiteKey]);

  useEffect(() => {
    if (window.turnstile) {
      setScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (!scriptReady) {
      return;
    }

    renderInvisibleWidget();
  }, [renderInvisibleWidget, scriptReady]);

  return {
    turnstileSiteKey,
    containerRef,
    requestToken,
    onScriptReady: () => setScriptReady(true),
  };
}
