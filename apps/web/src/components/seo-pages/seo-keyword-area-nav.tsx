import { toAreaAnchorId } from "@/lib/seo-pages/anchors";
import type { SeoKeywordGroup } from "@/lib/seo-pages/types";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function SeoKeywordAreaNav({ groups }: { groups: SeoKeywordGroup[] }) {
  return (
    <div
      id="areas"
      style={{
        paddingTop: 28,
        borderTop: "1px solid rgba(10,10,10,0.07)",
        scrollMarginTop: 96,
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
        Escolha sua área
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {groups.map((group) => {
          const anchor = toAreaAnchorId(group.area);
          return (
            <a
              key={group.area}
              href={`#${anchor}`}
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: 0.5,
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.12)",
                borderRadius: 6,
                padding: "5px 10px",
                color: "#0a0a0a",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {group.area}
            </a>
          );
        })}
      </div>
    </div>
  );
}
