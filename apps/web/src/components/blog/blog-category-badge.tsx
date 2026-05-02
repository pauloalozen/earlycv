const MONO = "var(--font-geist-mono), monospace";

type BlogCategoryBadgeProps = {
  category: string;
};

export function BlogCategoryBadge({ category }: BlogCategoryBadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: MONO,
        fontSize: 9.5,
        letterSpacing: 1,
        color: "#5a5a55",
        fontWeight: 500,
        background: "rgba(10,10,10,0.05)",
        border: "1px solid rgba(10,10,10,0.08)",
        padding: "3px 8px",
        borderRadius: 4,
      }}
    >
      {category.toUpperCase()}
    </span>
  );
}
