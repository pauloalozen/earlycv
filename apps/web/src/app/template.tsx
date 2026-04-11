"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type TransitionPhase = "loading" | "revealing" | "done";

const MIN_SPINNER_MS = 180;
const REVEAL_MS = 340;

export default function Template({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<TransitionPhase>(() => {
    if (pathname === "/") {
      return "done";
    }

    return "loading";
  });

  useEffect(() => {
    if (pathname === "/") {
      setPhase("done");
      return;
    }

    setPhase("loading");

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (reducedMotionQuery.matches) {
      setPhase("done");
      return;
    }

    const revealTimer = window.setTimeout(() => {
      setPhase("revealing");
    }, MIN_SPINNER_MS);

    const doneTimer = window.setTimeout(() => {
      setPhase("done");
    }, MIN_SPINNER_MS + REVEAL_MS);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(doneTimer);
    };
  }, [pathname]);

  return (
    <>
      {phase !== "done" && (
        <div
          className={`route-transition-overlay ${phase === "revealing" ? "route-transition-overlay--exit" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="route-transition-spinner" aria-hidden="true" />
          <span className="sr-only">Loading page content</span>
        </div>
      )}

      <div
        className={`route-transition-content route-transition-content--${phase}`}
        aria-busy={phase !== "done"}
      >
        {children}
      </div>
    </>
  );
}
