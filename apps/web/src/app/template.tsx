"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type TransitionPhase = "loading" | "revealing" | "done";

const MIN_SPINNER_MS = 180;
const REVEAL_MS = 340;
const SAFETY_TIMEOUT_MS = 2500;

// Generous window: covers slow server-component fetches on back/forward navigation.
const BACK_FORWARD_WINDOW_MS = 3500;

function shouldSkipRouteTransition(pathname: string): boolean {
  return pathname === "/" || pathname === "/planos";
}

// Timestamp of the last detected back/forward navigation event.
// Set before React renders so the useState initializer can read it.
let lastBackForwardAt = 0;

function wasRecentBackForwardNavigation(): boolean {
  if (typeof window === "undefined") return false;
  return Date.now() - lastBackForwardAt < BACK_FORWARD_WINDOW_MS;
}

// Callbacks for bfcache restore — intentionally not cleaned up.
// Each Template instance registers its setPhase("done"); React's cleanup
// (which runs on bfcache pagehide) removes effect listeners but cannot
// remove module-level Set entries, so the callbacks survive freeze/restore.
// Stale entries from unmounted instances are harmless: React 18 silently
// discards setState calls on unmounted components.
const phaseDoneCallbacks = new Set<() => void>();

function forceReleaseTransitionDom() {
  if (typeof document === "undefined") return;

  const overlays = document.querySelectorAll(".route-transition-overlay");
  for (const overlay of overlays) {
    overlay.remove();
  }

  const contents = document.querySelectorAll(".route-transition-content");
  for (const content of contents) {
    content.classList.remove("route-transition-content--loading");
    content.classList.remove("route-transition-content--revealing");
    content.classList.add("route-transition-content--done");
    content.setAttribute("aria-busy", "false");
  }
}

// Module-level listeners — registered once at load, never removed.
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", () => {
    // Fires on initial load (phaseDoneCallbacks empty → no-op) and on bfcache
    // restore where React cleanup has already cleared timers and effect listeners.
    lastBackForwardAt = Date.now();
    forceReleaseTransitionDom();
    for (const fn of phaseDoneCallbacks) fn();
  });

  window.addEventListener("popstate", () => {
    // Fires on browser back/forward (client-side navigation).
    // Set the timestamp BEFORE React renders the new route so the useState
    // initializer can skip the entry spinner on back/forward navigations.
    lastBackForwardAt = Date.now();
    forceReleaseTransitionDom();
    for (const fn of phaseDoneCallbacks) fn();
  });
}

export default function Template({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  // Per-instance generation counter.
  // Prevents cross-instance interference when multiple Template components are
  // nested (e.g. root template + segment template on /adaptar): a module-level
  // counter would let one instance's effect invalidate the other's timers.
  const genRef = useRef(0);

  const [phase, setPhase] = useState<TransitionPhase>(() => {
    if (typeof window === "undefined") return "loading";
    if (shouldSkipRouteTransition(pathname)) return "done";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return "done";
    // Full-page back/forward loads: browser already handled the page load.
    const navigationEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigationEntry?.type === "back_forward") return "done";
    // Client-side back/forward: popstate set the timestamp before this render.
    if (wasRecentBackForwardNavigation()) return "done";
    return "loading";
  });

  // Register force-done callback for bfcache restore.
  // No cleanup — entry must outlive React's pagehide cleanup.
  useEffect(() => {
    const fn = () => setPhase("done");
    phaseDoneCallbacks.add(fn);
  }, []);

  useEffect(() => {
    if (shouldSkipRouteTransition(pathname)) {
      setPhase("done");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("done");
      return;
    }

    // Back/forward navigation: timestamp was set before this render; skip spinner.
    if (wasRecentBackForwardNavigation()) {
      forceReleaseTransitionDom();
      setPhase("done");
      return;
    }

    genRef.current += 1;
    const myGen = genRef.current;
    setPhase("loading");

    const t1 = window.setTimeout(() => {
      if (genRef.current !== myGen) return;
      setPhase("revealing");
    }, MIN_SPINNER_MS);

    const t2 = window.setTimeout(() => {
      if (genRef.current !== myGen) return;
      setPhase("done");
    }, MIN_SPINNER_MS + REVEAL_MS);

    // Safety timer intentionally NOT cleared in cleanup — fires even if the
    // component unmounts/remounts (suspense retry, Next.js soft-nav retry, etc.).
    // Per-instance genRef makes it a no-op for any superseded transition.
    window.setTimeout(() => {
      if (genRef.current !== myGen) return;
      setPhase("done");
    }, SAFETY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      // Safety timer not cleared — intentional, see comment above.
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
