type IconProps = { size?: number };

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BriefcaseIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      {...STROKE}
    >
      <rect x="2.5" y="6.5" width="15" height="10" rx="1.5" />
      <path d="M7 6.5V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M2.5 11h15" />
    </svg>
  );
}

export function RadarIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      {...STROKE}
    >
      <circle cx="10" cy="10" r="7.25" />
      <circle cx="10" cy="10" r="3.75" />
      <path d="M10 10 L15 6" />
    </svg>
  );
}

export function FileCheckIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      {...STROKE}
    >
      <path d="M6 2.5h5.5L15 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
      <path d="M11 2.5V6h4" />
      <path d="M7.5 11.5l1.5 1.5 3-3.5" />
    </svg>
  );
}

export function TrendUpIcon({ size = 12 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      {...STROKE}
    >
      <path d="M3 13l5-5 3 3 6-6" />
      <path d="M13 5h4v4" />
    </svg>
  );
}
