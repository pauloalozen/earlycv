import type { ReactNode } from "react";

type AdminShellHeaderProps = {
  actions?: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  title: string;
};

export function AdminShellHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: AdminShellHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 32,
        padding: "28px 0 20px",
      }}
    >
      <div style={{ flex: 1 }}>
        {eyebrow ? (
          <div
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: 10.5,
              letterSpacing: 1.3,
              color: "#8a8580",
              fontWeight: 500,
              marginBottom: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#0a0a0a",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {eyebrow.toUpperCase()}
          </div>
        ) : null}
        <h1
          style={{
            fontFamily: '"Geist", sans-serif',
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -1.1,
            color: "#2a2620",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              fontSize: 14,
              color: "#6a6560",
              marginTop: 8,
              maxWidth: 680,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            paddingTop: 4,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
