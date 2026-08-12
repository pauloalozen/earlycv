"use client";

import { useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

// Abaixo disso, o favicon devolvido pelo serviço do Google é o ícone
// genérico (globo cinza) que ele usa quando o domínio não tem favicon de
// verdade, ou uma imagem tão pequena que fica borrada esticada pro
// tamanho do card — em ambos os casos preferível cair no quadrado
// colorido do que mostrar um logo feio.
const MIN_GOOD_LOGO_SIZE = 64;

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
// Company.websiteUrl) quando disponível E com resolução boa (ver
// MIN_GOOD_LOGO_SIZE); senão volta pro quadrado colorido com a inicial do
// nome — tanto pra URL inválida/erro de load quanto pra favicon
// genérico/pequeno demais.
export function CompanyLogo({
  name,
  websiteUrl,
  size = 42,
  borderRadius = 9,
  fontSize = 13,
}: Props) {
  const src = websiteUrl ? faviconUrl(websiteUrl) : null;
  const [isBadLogo, setIsBadLogo] = useState(false);

  if (src && !isBadLogo) {
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
        onError={() => setIsBadLogo(true)}
        onLoad={(event) => {
          const img = event.currentTarget;
          if (
            img.naturalWidth < MIN_GOOD_LOGO_SIZE ||
            img.naturalHeight < MIN_GOOD_LOGO_SIZE
          ) {
            setIsBadLogo(true);
          }
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
