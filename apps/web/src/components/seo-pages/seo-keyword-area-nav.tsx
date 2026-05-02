import { toAreaAnchorId } from "@/lib/seo-pages/anchors";
import type { SeoKeywordGroup } from "@/lib/seo-pages/types";

export function SeoKeywordAreaNav({ groups }: { groups: SeoKeywordGroup[] }) {
  return (
    <section
      id="areas"
      className="rounded-2xl border border-stone-200 bg-white p-6 scroll-mt-24"
    >
      <h2 className="text-2xl font-semibold tracking-tight">
        Escolha sua area
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Va direto para as palavras-chave mais proximas do seu objetivo
        profissional.
      </p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 md:flex-wrap">
        {groups.map((group) => {
          const anchor = toAreaAnchorId(group.area);
          return (
            <a
              className="inline-flex shrink-0 rounded-full border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              href={`#${anchor}`}
              key={group.area}
            >
              {group.area}
            </a>
          );
        })}
      </div>
    </section>
  );
}
