import { toAreaAnchorId } from "@/lib/seo-pages/anchors";
import type { SeoKeywordGroup } from "@/lib/seo-pages/types";

export function SeoKeywordHub({ groups }: { groups: SeoKeywordGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section
          id={toAreaAnchorId(group.area)}
          key={group.area}
          className="rounded-2xl border border-stone-200 bg-white p-6 scroll-mt-24"
        >
          <h2 className="text-2xl font-semibold tracking-tight">
            {group.area}
          </h2>
          <p className="mt-2 text-sm text-stone-600">{group.description}</p>
          <p className="mt-2">
            <a className="text-xs underline text-stone-600" href="#areas">
              Voltar para areas
            </a>
          </p>

          <div className="mt-4 space-y-4">
            {group.roles.map((role) => (
              <article
                key={`${group.area}-${role.title}`}
                className="rounded-xl border border-stone-200 p-4"
              >
                <h3 className="text-lg font-semibold">{role.title}</h3>
                <div className="mt-3 grid gap-2">
                  {role.keywords.map((keyword) => (
                    <div
                      key={`${role.title}-${keyword.term}`}
                      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
                    >
                      <p className="text-sm font-semibold text-stone-900">
                        {keyword.term}
                      </p>
                      <p className="text-xs text-stone-700">
                        <strong>Onde usar:</strong> {keyword.whereToUse}
                      </p>
                      <p className="text-xs text-stone-700">
                        <strong>Quando faz sentido:</strong>{" "}
                        {keyword.whenItMakesSense}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
