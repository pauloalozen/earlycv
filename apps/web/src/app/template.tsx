"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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

  return (
    <PosthogAuthProvider>
      <Suspense fallback={null}>
        <JourneyTrackerProvider>
          {loading && (
            <div
              className="route-transition-overlay"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="route-transition-spinner" aria-hidden="true" />
              <span className="sr-only">Loading page content</span>
            </div>
          )}
          <div
            className={`route-transition-content ${loading ? "--loading" : "--ready"}`}
          >
            {children}
          </div>
        </JourneyTrackerProvider>
      </Suspense>
    </PosthogAuthProvider>
  );
}
