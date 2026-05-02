import Link from "next/link";
import { Logo } from "./logo";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function PublicNavBar({ dark = false }: { dark?: boolean }) {
  const bg = dark ? "#0a0a0a" : "transparent";
  const borderColor = dark ? "rgba(250,250,246,0.06)" : "rgba(0,0,0,0.04)";
  const linkColor = dark ? "#a0a098" : "#3a3a38";
  const logoVariant = dark ? "dark" : "light";

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "18px 40px",
        borderBottom: `1px solid ${borderColor}`,
        background: bg,
        position: "relative",
        zIndex: 2,
        fontFamily: GEIST,
      }}
    >
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
        }}
      >
        <Logo variant={logoVariant} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: dark ? "#5a5a54" : "#8a8a85",
            border: `1px solid ${dark ? "rgba(250,250,246,0.12)" : "#d8d6ce"}`,
            borderRadius: 3,
            padding: "1px 5px",
            fontWeight: 500,
          }}
        >
          v1.2
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Link
          href="/blog"
          style={{
            fontSize: 13,
            color: linkColor,
            fontWeight: 400,
            textDecoration: "none",
          }}
        >
          Blog
        </Link>
        <Link
          href="/#como-funciona"
          style={{
            fontSize: 13,
            color: linkColor,
            fontWeight: 400,
            textDecoration: "none",
          }}
        >
          Como funciona
        </Link>
        <Link
          href="/adaptar"
          style={{
            background: dark ? "#fafaf6" : "#0a0a0a",
            color: dark ? "#0a0a0a" : "#fff",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12.5,
            fontWeight: 500,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Adaptar meu CV →
        </Link>
      </div>
    </nav>
  );
}
