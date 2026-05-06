import Link from "next/link";

import type { BlogPost } from "@/lib/blog/types";

const MONO = "var(--font-geist-mono), monospace";

type BlogCategoryFilterProps = {
  activeCategory: string;
  categories: string[];
};

export function BlogCategoryFilter({
  activeCategory,
  categories,
}: BlogCategoryFilterProps) {
  const categoryOptions = ["Todos", ...categories];

  return (
    <section
      aria-label="Filtro por categoria"
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      {categoryOptions.map((category) => {
        const isActive = category === activeCategory;
        const href =
          category === "Todos" ? "/blog" : `/blog?category=${encodeURIComponent(category)}`;

        return (
          <Link
            key={category}
            href={href}
            style={{
              textDecoration: "none",
              border: `1px solid ${isActive ? "rgba(10,10,10,0.22)" : "rgba(10,10,10,0.08)"}`,
              background: isActive ? "rgba(10,10,10,0.1)" : "rgba(10,10,10,0.04)",
              color: isActive ? "#0a0a0a" : "#5a5a55",
              padding: "5px 10px",
              borderRadius: 999,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 0.2,
              fontWeight: 500,
              lineHeight: 1,
              transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
            }}
            aria-current={isActive ? "page" : undefined}
          >
            {category}
          </Link>
        );
      })}
    </section>
  );
}
