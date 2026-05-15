"use client";

import { useEffect, useState } from "react";
import {
  isAnalyticsConsentGateEnabled,
  onAnalyticsConsentPreferencesOpen,
  readAnalyticsConsentState,
  setAnalyticsConsentState,
  type AnalyticsConsentState,
} from "@/lib/analytics-consent";

export function AnalyticsConsentBanner() {
  const [state, setState] = useState<AnalyticsConsentState>("unknown");
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    setState(readAnalyticsConsentState());

    const unsubscribe = onAnalyticsConsentPreferencesOpen(() => {
      setForceOpen(true);
    });

    return unsubscribe;
  }, []);

  if (!isAnalyticsConsentGateEnabled() || (!forceOpen && state !== "unknown")) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-3 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:px-0">
      <div className="mx-auto w-full max-w-[500px] rounded-2xl bg-white/65 px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.14)] ring-1 ring-white/45 backdrop-blur-xl sm:max-w-[480px]">
        <div className="flex flex-col gap-2 text-sm text-neutral-800">
          <p>
            Usamos cookies essenciais para o EarlyCV funcionar e opcionais para
            melhorar sua experiência.
          </p>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-md border border-transparent bg-transparent px-3 py-2 text-neutral-600 transition hover:bg-white/50 hover:text-neutral-700"
            onClick={() => {
              setAnalyticsConsentState("denied");
              setState("denied");
              setForceOpen(false);
            }}
          >
            Recusar opcionais
          </button>
          <button
            type="button"
            className="rounded-md bg-neutral-900 px-3 py-2 text-white transition hover:bg-neutral-800"
            onClick={() => {
              setAnalyticsConsentState("accepted");
              setState("accepted");
              setForceOpen(false);
            }}
          >
            Aceitar
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
