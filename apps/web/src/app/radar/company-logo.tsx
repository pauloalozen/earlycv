"use client";

import { type SyntheticEvent, useState } from "react";

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
  logoUrl?: string | null;
  websiteUrl?: string | null;
  size?: number;
  borderRadius?: number;
  fontSize?: number;
};

// 3 níveis, nessa ordem: 1) logo capturado da própria fonte de origem
// (Gupy/Greenhouse/etc, via Company.logoUrl — CompanyLogoFetchService no
// backend) quando disponível e com resolução boa; 2) favicon via serviço
// público de favicons a partir de Company.websiteUrl, mesma checagem de
// qualidade; 3) quadrado colorido com a inicial do nome — pra URL
// inválida/erro de load ou logo/favicon genérico/pequeno demais em
// qualquer um dos dois primeiros níveis.
export function CompanyLogo({
  name,
  logoUrl,
  websiteUrl,
  size = 42,
  borderRadius = 9,
  fontSize = 13,
}: Props) {
  const faviconSrc = websiteUrl ? faviconUrl(websiteUrl) : null;
  const [isSourceLogoBad, setIsSourceLogoBad] = useState(false);
  const [isFaviconBad, setIsFaviconBad] = useState(false);

  const imgStyle = {
    width: size,
    height: size,
    borderRadius,
    flexShrink: 0,
    objectFit: "contain" as const,
  };

  function handleLoad(setBad: (bad: boolean) => void) {
    return (event: SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (
        img.naturalWidth < MIN_GOOD_LOGO_SIZE ||
        img.naturalHeight < MIN_GOOD_LOGO_SIZE
      ) {
        setBad(true);
      }
    };
  }

  if (logoUrl && !isSourceLogoBad) {
    return (
      // biome-ignore lint/performance/noImgElement: logo de domínio externo, sem otimização do next/image
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        style={imgStyle}
        onError={() => setIsSourceLogoBad(true)}
        onLoad={handleLoad(setIsSourceLogoBad)}
      />
    );
  }

  if (faviconSrc && !isFaviconBad) {
    return (
      // biome-ignore lint/performance/noImgElement: favicon de domínio externo, sem otimização do next/image
      <img
        src={faviconSrc}
        alt=""
        width={size}
        height={size}
        style={imgStyle}
        onError={() => setIsFaviconBad(true)}
        onLoad={handleLoad(setIsFaviconBad)}
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
