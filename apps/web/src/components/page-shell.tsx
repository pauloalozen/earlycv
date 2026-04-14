"use client";

import { useEffect, useState } from "react";

export function PageShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => setReady(true));

    const handlePageShow = () => {
      setReady(true);
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <>
      {!ready && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F2F2F2]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
        </div>
      )}
      <div
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(-8px)",
          transition: ready
            ? "opacity 480ms cubic-bezier(0.22,1,0.36,1), transform 480ms cubic-bezier(0.22,1,0.36,1)"
            : "none",
        }}
      >
        {children}
      </div>
    </>
  );
}
