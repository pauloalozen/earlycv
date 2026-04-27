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
  const bar = variant === "dark" ? "rgba(250,250,246,0.75)" : "#0a0a0a";
  const dimmed =
    variant === "dark" ? "rgba(250,250,246,0.15)" : "rgba(10,10,10,0.18)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="15" height="4" rx="1.5" fill={bar} />
        <rect x="17" y="0" width="12" height="4" rx="1.5" fill={bar} />
        <rect x="31" y="0" width="10" height="4" rx="1.5" fill="#c6ff3a" />
        <rect x="0" y="14" width="17" height="4" rx="1.5" fill="#c6ff3a" />
        <rect x="19" y="14" width="24" height="4" rx="1.5" fill={bar} />
        <rect x="0" y="28" width="9" height="4" rx="1.5" fill={bar} />
        <rect x="12" y="28" width="17" height="4" rx="1.5" fill="#c6ff3a" />
        <rect x="31" y="28" width="10" height="4" rx="1.5" fill={dimmed} />
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
