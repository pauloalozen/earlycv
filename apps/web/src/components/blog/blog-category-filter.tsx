import Link from "next/link";

const MONO = "var(--font-geist-mono), monospace";

export type BlogPostOrder = "asc" | "desc";

type BlogCategoryFilterProps = {
  activeCategory: string;
  categories: string[];
  order: BlogPostOrder;
};

function buildHref(category: string, order: BlogPostOrder) {
  const params = new URLSearchParams();
  if (category !== "Todos") {
    params.set("category", category);
  }
  if (order !== "desc") {
    params.set("order", order);
  }
  const query = params.toString();
  return query ? `/blog?${query}` : "/blog";
}

export function BlogCategoryFilter({
  activeCategory,
  categories,
  order,
}: BlogCategoryFilterProps) {
  const categoryOptions = ["Todos", ...categories];
  const nextOrder: BlogPostOrder = order === "desc" ? "asc" : "desc";

  return (
    <section
      aria-label="Filtro por categoria e ordenação"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {categoryOptions.map((category) => {
          const isActive = category === activeCategory;

          return (
            <Link
              key={category}
              href={buildHref(category, order)}
              style={{
                textDecoration: "none",
                border: `1px solid ${isActive ? "rgba(10,10,10,0.22)" : "rgba(10,10,10,0.08)"}`,
                background: isActive
                  ? "rgba(10,10,10,0.1)"
                  : "rgba(10,10,10,0.04)",
                color: isActive ? "#0a0a0a" : "#5a5a55",
                padding: "5px 10px",
                borderRadius: 999,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 0.2,
                fontWeight: 500,
                lineHeight: 1,
                transition:
                  "background 120ms ease, border-color 120ms ease, color 120ms ease",
              }}
              aria-current={isActive ? "page" : undefined}
            >
              {category}
            </Link>
          );
        })}
      </div>

      <Link
        href={buildHref(activeCategory, nextOrder)}
        style={{
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "1px solid rgba(10,10,10,0.08)",
          background: "rgba(10,10,10,0.04)",
          color: "#5a5a55",
          padding: "5px 10px",
          borderRadius: 999,
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 0.2,
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: "nowrap",
          transition:
            "background 120ms ease, border-color 120ms ease, color 120ms ease",
        }}
        aria-label={
          order === "desc"
            ? "Ordenar por data crescente"
            : "Ordenar por data decrescente"
        }
      >
        DATA {order === "desc" ? "↓" : "↑"}
      </Link>
    </section>
  );
}
