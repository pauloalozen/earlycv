import Link from "next/link";

import type { SeoRelatedLink } from "@/lib/seo-pages/types";

export function SeoInternalLinks({ links }: { links: SeoRelatedLink[] }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-xl font-semibold tracking-tight">
        Leituras relacionadas
      </h2>
      <ul className="mt-3 space-y-2 text-stone-700">
        {links.map((link) => (
          <li key={link.href}>
            <Link className="underline decoration-stone-400" href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
