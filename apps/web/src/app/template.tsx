"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EcvBuildLoader } from "@/components/ecv-loader";
import { AnalyticsConsentBanner } from "./_components/analytics-consent-banner";
import { JourneyTrackerProvider } from "./_components/journey-tracker-provider";
import { PosthogAuthProvider } from "./_components/posthog-auth-provider";

export default function Template({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: route transition must react to pathname changes
  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timeout);
  }, [pathname]);

  // O conteúdo NÃO fica dentro do <Suspense> do tracker: o tracker usa
  // useSearchParams(), que na geração ESTÁTICA (ISR/SSG) faz o boundary cair
  // em renderização só no cliente — com fallback={null} o corpo inteiro da
  // página saía do HTML. JourneyTrackerProvider não expõe contexto (só roda
  // efeitos e devolve children), então ele é renderizado como irmão e por
  // último: os efeitos seguem na mesma ordem de antes (filhos antes do pai).
  return (
    <PosthogAuthProvider>
      {loading && (
        <div
          className="route-transition-overlay"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <EcvBuildLoader size={48} />
          <span className="sr-only">Loading page content</span>
        </div>
      )}
      <div
        className={`route-transition-content ${loading ? "--loading" : "--ready"}`}
      >
        {children}
      </div>
      <AnalyticsConsentBanner />
      <Suspense fallback={null}>
        <JourneyTrackerProvider>{null}</JourneyTrackerProvider>
      </Suspense>
    </PosthogAuthProvider>
  );
}
