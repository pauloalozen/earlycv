"use client";

import { useEffect, useRef, useState } from "react";

type TransitionPhase = "loading" | "revealing" | "done";

const MIN_SPINNER_MS = 180;
const REVEAL_MS = 340;
const SAFETY_TIMEOUT_MS = 2500;

export function PlanosFocusRemount({
  children,
}: {
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<TransitionPhase>("loading");
  const [focusVersion, setFocusVersion] = useState(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };

    const startTransition = () => {
      setPhase("loading");
      setFocusVersion((current) => current + 1);

      clearTimers();
      const t1 = window.setTimeout(() => setPhase("revealing"), MIN_SPINNER_MS);
      const t2 = window.setTimeout(
        () => setPhase("done"),
        MIN_SPINNER_MS + REVEAL_MS,
      );
      const t3 = window.setTimeout(() => setPhase("done"), SAFETY_TIMEOUT_MS);
      timersRef.current = [t1, t2, t3];
    };

    const remountWhenReady = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) return;

      startTransition();
    };

    startTransition();

    window.addEventListener("focus", remountWhenReady);
    window.addEventListener("pageshow", remountWhenReady);
    window.addEventListener("popstate", remountWhenReady);
    document.addEventListener("visibilitychange", remountWhenReady);

    return () => {
      clearTimers();
      window.removeEventListener("focus", remountWhenReady);
      window.removeEventListener("pageshow", remountWhenReady);
      window.removeEventListener("popstate", remountWhenReady);
      document.removeEventListener("visibilitychange", remountWhenReady);
    };
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
        key={focusVersion}
        className={`route-transition-content route-transition-content--${phase}`}
        aria-busy={phase !== "done"}
      >
        {children}
      </div>
    </>
  );
}
