import type { SeoPageSection } from "@/lib/seo-pages/types";

export function SeoSection({ section }: { section: SeoPageSection }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-2xl font-semibold tracking-tight">
        {section.heading}
      </h2>
      {section.paragraphs?.map((paragraph) => (
        <p className="mt-3 text-stone-700" key={paragraph}>
          {paragraph}
        </p>
      ))}
      {section.bullets?.length ? (
        <ul className="mt-4 list-disc space-y-2 pl-5 text-stone-700">
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {section.example ? (
        <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-800">
          {section.example.title ? (
            <p className="font-semibold">{section.example.title}</p>
          ) : null}
          <p>
            <strong>Antes:</strong> {section.example.before}
          </p>
          <p>
            <strong>Depois:</strong> {section.example.after}
          </p>
        </div>
      ) : null}
    </section>
  );
}
