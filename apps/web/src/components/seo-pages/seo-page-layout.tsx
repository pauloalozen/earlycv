import type { ReactNode } from "react";

export function SeoPageLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10 md:px-10">
        {children}
      </div>
    </main>
  );
}
