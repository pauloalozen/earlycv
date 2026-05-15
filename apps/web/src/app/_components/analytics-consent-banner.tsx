"use client";

import { useEffect, useState } from "react";
import {
  isAnalyticsConsentGateEnabled,
  readAnalyticsConsentState,
  setAnalyticsConsentState,
  type AnalyticsConsentState,
} from "@/lib/analytics-consent";

export function AnalyticsConsentBanner() {
  const [state, setState] = useState<AnalyticsConsentState>("unknown");

  useEffect(() => {
    setState(readAnalyticsConsentState());
  }, []);

  if (!isAnalyticsConsentGateEnabled() || state !== "unknown") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 text-sm text-neutral-800 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Usamos analytics para melhorar o produto. Cookies essenciais de sessao
          continuam ativos.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1.5"
            onClick={() => {
              setAnalyticsConsentState("denied");
              setState("denied");
            }}
          >
            Recusar analytics
          </button>
          <button
            type="button"
            className="rounded bg-neutral-900 px-3 py-1.5 text-white"
            onClick={() => {
              setAnalyticsConsentState("accepted");
              setState("accepted");
            }}
          >
            Aceitar analytics
          </button>
        </div>
      </div>
    </div>
  );
}
