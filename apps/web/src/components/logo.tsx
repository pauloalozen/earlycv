const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

type Props = {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
};

const SIZES = {
  sm: { icon: 13, font: 14, gap: 8, ls: "-0.5px" },
  md: { icon: 16, font: 17, gap: 10, ls: "-0.6px" },
  lg: { icon: 21, font: 22, gap: 12, ls: "-0.8px" },
} as const;

export function Logo({ variant = "light", size = "md" }: Props) {
  const { icon, font, gap, ls } = SIZES[size];
  const color = variant === "dark" ? "#fafaf6" : "#0a0a0a";
  const ink = variant === "dark" ? "rgba(250,250,246,0.93)" : "#0a0a0a";
  const dimmed =
    variant === "dark" ? "rgba(250,250,246,0.14)" : "rgba(10,10,10,0.14)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <rect x="0"  y="0"    width="12" height="6.5" rx="2" fill={ink} />
        <rect x="16" y="0"    width="12" height="6.5" rx="2" fill={ink} />
        <rect x="32" y="0"    width="8"  height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="0"  y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill={ink} />
        <rect x="0"  y="22.4" width="7"  height="6.5" rx="2" fill={ink} />
        <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="30" y="22.4" width="8"  height="6.5" rx="2" fill={ink} />
        <rect x="0"  y="33.5" width="22" height="6.5" rx="2" fill={ink} />
        <rect x="26" y="33.5" width="9"  height="6.5" rx="2" fill={dimmed} />
      </svg>
      <span style={{ display: "inline-flex", alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: GEIST,
            fontSize: font,
            fontWeight: 300,
            letterSpacing: ls,
            color,
            lineHeight: 1,
          }}
        >
          early
        </span>
        <span
          style={{
            fontFamily: GEIST,
            fontSize: font,
            fontWeight: 700,
            letterSpacing: ls,
            color,
            lineHeight: 1,
          }}
        >
          CV
        </span>
      </span>
    </span>
  );
}
