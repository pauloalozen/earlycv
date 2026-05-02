"use client";

import Link from "next/link";

import { trackSeoPageCtaClicked } from "@/lib/seo-pages/tracking";

export function SeoAnalysisCta({
  buttonLabel,
  description,
  location,
  path,
  slug,
  target,
  title,
}: {
  buttonLabel: string;
  description: string;
  location: "bottom" | "hero" | "middle";
  path: string;
  slug: string;
  target: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl bg-stone-900 p-6 text-stone-50">
      <p className="text-sm uppercase tracking-[0.14em] text-stone-300">
        analise gratuita
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-stone-300">{description}</p>
      <Link
        className="mt-5 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-900"
        href={target}
        onClick={() => {
          queueMicrotask(() => {
            void trackSeoPageCtaClicked({
              location,
              path,
              slug,
              target,
            });
          });
        }}
      >
        {buttonLabel}
      </Link>
    </div>
  );
}
