type BlogCategoryBadgeProps = {
  category: string;
};

export function BlogCategoryBadge({ category }: BlogCategoryBadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-700">
      {category}
    </span>
  );
}
