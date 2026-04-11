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
    if (typeof window !== "undefined") {
      if (
        pathname === "/" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return "done";
      }
    }
    return pathname === "/" ? "done" : "loading";
  });

  // Empty deps: template.tsx remounts on every navigation, so this fires
  // exactly once per page transition — pathname is stable at mount time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — template remounts per navigation, pathname is stable
  useEffect(() => {
    if (pathname === "/") {
      setPhase("done");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
  }, []);

  // Handle bfcache restoration (browser back/forward from OS-level cache).
  // In that case React effects don't re-run, so we force done via pageshow.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPhase("done");
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <>
      {phase !== "done" && (
        <div
          className={`route-transition-overlay ${phase === "revealing" ? "route-transition-overlay--exit" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          onAnimationEnd={() => {
            if (phase === "revealing") setPhase("done");
          }}
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
