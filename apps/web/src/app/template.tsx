"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Template({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <>
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
    </>
  );
}
