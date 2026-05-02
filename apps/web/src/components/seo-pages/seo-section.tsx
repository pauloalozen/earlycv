import type { SeoPageSection } from "@/lib/seo-pages/types";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function SeoSection({ section }: { section: SeoPageSection }) {
  return (
    <div
      style={{
        paddingTop: 28,
        borderTop: "1px solid rgba(10,10,10,0.07)",
      }}
    >
      <h2
        style={{
          fontSize: 21,
          fontWeight: 500,
          letterSpacing: -0.6,
          margin: "0 0 12px",
          color: "#0a0a0a",
          fontFamily: GEIST,
        }}
      >
        {section.heading}
      </h2>
      {section.paragraphs?.map((paragraph) => (
        <p
          key={paragraph}
          style={{
            fontSize: 15,
            lineHeight: 1.75,
            color: "#2a2a28",
            marginBottom: 12,
            fontFamily: GEIST,
          }}
        >
          {paragraph}
        </p>
      ))}
      {section.bullets?.length ? (
        <ul style={{ paddingLeft: 20, margin: "0 0 8px" }}>
          {section.bullets.map((bullet) => (
            <li
              key={bullet}
              style={{
                fontSize: 14.5,
                lineHeight: 1.7,
                color: "#2a2a28",
                marginBottom: 4,
                fontFamily: GEIST,
              }}
            >
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
      {section.example ? (
        <div
          style={{
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 10,
            padding: "14px 16px",
            marginTop: 12,
            fontFamily: GEIST,
          }}
        >
          {section.example.title ? (
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: "#0a0a0a",
              }}
            >
              {section.example.title}
            </p>
          ) : null}
          <p style={{ fontSize: 13, color: "#2a2a28", marginBottom: 4 }}>
            <strong>Antes:</strong> {section.example.before}
          </p>
          <p style={{ fontSize: 13, color: "#2a2a28", margin: 0 }}>
            <strong>Depois:</strong> {section.example.after}
          </p>
        </div>
      ) : null}
    </div>
  );
}
