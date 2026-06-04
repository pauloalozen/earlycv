"use client";

import { useEffect, useState } from "react";

export function PageShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const reveal = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setReady(true), 100);
    };

    setReady(false);
    reveal();

    const handlePageShow = () => setReady(true);
    const handlePopState = () => {
      setReady(false);
      reveal();
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
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
          transition: ready
            ? "opacity 480ms cubic-bezier(0.22,1,0.36,1)"
            : "none",
        }}
      >
        {children}
      </div>
    </>
  );
}
