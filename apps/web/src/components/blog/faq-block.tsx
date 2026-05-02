import type { BlogFaqItem } from "@/lib/blog/types";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function FaqBlock({ items }: { items: BlogFaqItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section style={{ fontFamily: GEIST }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: -0.7,
          margin: "8px 0 16px",
          color: "#0a0a0a",
        }}
      >
        FAQ
      </h2>
      {items.map((item) => (
        <div
          key={item.question}
          style={{
            borderTop: "1px solid rgba(10,10,10,0.07)",
            paddingTop: 16,
            paddingBottom: 16,
          }}
        >
          <h3
            style={{
              fontSize: 15.5,
              fontWeight: 500,
              margin: "0 0 6px",
              color: "#0a0a0a",
            }}
          >
            {item.question}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "#45443e",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {item.answer}
          </p>
        </div>
      ))}
    </section>
  );
}
