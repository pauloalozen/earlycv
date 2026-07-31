const MONO = "var(--font-geist-mono), monospace";

const COMPANY_COLORS = [
  "#3a7ff6",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#22c55e",
  "#ec4899",
  "#eab308",
];

function getCompanyColor(name: string): string {
  return COMPANY_COLORS[name.charCodeAt(0) % COMPANY_COLORS.length];
}

function faviconUrl(websiteUrl: string): string | null {
  try {
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`;
  } catch {
    return null;
  }
}

type Props = {
  name: string;
  websiteUrl?: string | null;
  size?: number;
  borderRadius?: number;
  fontSize?: number;
};

// Favicon real da empresa (via serviço público de favicons, a partir de
// Company.websiteUrl) quando disponível; senão volta pro quadrado colorido
// com a inicial do nome — mesmo fallback visual de antes.
export function CompanyLogo({
  name,
  websiteUrl,
  size = 42,
  borderRadius = 9,
  fontSize = 13,
}: Props) {
  const src = websiteUrl ? faviconUrl(websiteUrl) : null;

  if (src) {
    return (
      // biome-ignore lint/performance/noImgElement: favicon de domínio externo, sem otimização do next/image
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius,
          flexShrink: 0,
          objectFit: "contain",
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius,
        background: getCompanyColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize,
        fontWeight: 700,
        letterSpacing: 0,
        flexShrink: 0,
        fontFamily: MONO,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
