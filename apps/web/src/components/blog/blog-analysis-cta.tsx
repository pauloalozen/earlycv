"use client";

import Link from "next/link";

import { trackBlogCtaClicked } from "@/lib/blog/tracking";

export function BlogAnalysisCta({
  location,
  slug,
}: {
  location: "top" | "middle" | "bottom" | "index";
  slug?: string;
}) {
  return (
    <div className="rounded-2xl bg-stone-900 p-6 text-stone-50">
      <p className="text-sm uppercase tracking-[0.14em] text-stone-300">
        analise gratuita
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">
        Compare seu CV com a vaga em minutos
      </h3>
      <p className="mt-2 text-sm text-stone-300">
        Veja lacunas, pontos fortes e ajustes possiveis sem inventar
        informacoes.
      </p>
      <Link
        className="mt-5 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-900"
        href="/adaptar"
        onClick={() => {
          void trackBlogCtaClicked(location, slug);
        }}
      >
        Adaptar meu curriculo
      </Link>
    </div>
  );
}
