import type { BlogFaqItem } from "@/lib/blog/types";

export function FaqBlock({ items }: { items: BlogFaqItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
        FAQ
      </h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.question}>
            <h3 className="text-base font-semibold text-stone-900">
              {item.question}
            </h3>
            <p className="mt-1 text-sm leading-7 text-stone-600">
              {item.answer}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
