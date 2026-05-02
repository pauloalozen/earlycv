import { toAreaAnchorId } from "@/lib/seo-pages/anchors";
import type { SeoKeywordGroup } from "@/lib/seo-pages/types";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function SeoKeywordHub({ groups }: { groups: SeoKeywordGroup[] }) {
  return (
    <div>
      {groups.map((group) => (
        <div
          key={group.area}
          id={toAreaAnchorId(group.area)}
          style={{
            paddingTop: 28,
            borderTop: "1px solid rgba(10,10,10,0.07)",
            scrollMarginTop: 96,
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: -0.6,
              margin: "0 0 4px",
              color: "#0a0a0a",
              fontFamily: GEIST,
            }}
          >
            {group.area}
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: "#5a5a55",
              marginBottom: 12,
              fontFamily: GEIST,
            }}
          >
            {group.description}
          </p>
          <a
            href="#areas"
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#a0a098",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              display: "inline-block",
              marginBottom: 16,
            }}
          >
            Voltar para áreas
          </a>

          <div>
            {group.roles.map((role) => (
              <div
                key={`${group.area}-${role.title}`}
                style={{
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 12,
                  padding: "16px 18px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    marginBottom: 12,
                    letterSpacing: -0.2,
                    color: "#0a0a0a",
                    fontFamily: GEIST,
                  }}
                >
                  {role.title}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {role.keywords.map((keyword) => (
                    <div
                      key={`${role.title}-${keyword.term}`}
                      style={{
                        background: "#fff",
                        border: "1px solid rgba(10,10,10,0.07)",
                        borderRadius: 8,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "#0a0a0a",
                          marginBottom: 4,
                          fontFamily: GEIST,
                        }}
                      >
                        {keyword.term}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#5a5a55",
                          lineHeight: 1.5,
                          fontFamily: GEIST,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: "#8a8a85",
                            letterSpacing: 0.3,
                          }}
                        >
                          Onde usar:{" "}
                        </span>
                        {keyword.whereToUse}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#5a5a55",
                          lineHeight: 1.5,
                          fontFamily: GEIST,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: "#8a8a85",
                            letterSpacing: 0.3,
                          }}
                        >
                          Quando faz sentido:{" "}
                        </span>
                        {keyword.whenItMakesSense}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
