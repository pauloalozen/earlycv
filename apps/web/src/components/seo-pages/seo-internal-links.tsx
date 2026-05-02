import Link from "next/link";

import type { SeoRelatedLink } from "@/lib/seo-pages/types";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function SeoInternalLinks({ links }: { links: SeoRelatedLink[] }) {
  return (
    <div
      style={{
        paddingTop: 28,
        borderTop: "1px solid rgba(10,10,10,0.07)",
      }}
    >
      <h2
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: -0.7,
          margin: "0 0 16px",
          color: "#0a0a0a",
          fontFamily: GEIST,
        }}
      >
        Leituras relacionadas
      </h2>
      <div>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: "block",
              fontSize: 13.5,
              color: "#a0a098",
              marginBottom: 10,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontFamily: GEIST,
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
