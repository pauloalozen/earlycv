"use client";

import { useId } from "react";

// ── A · SCAN ── faixa verde varre o logo de cima a baixo (análise de CV)
export function EcvScanLoader({
  size = 64,
  dark = false,
}: {
  size?: number;
  dark?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const clipId = `ecv-clip-${uid}`;
  const gradId = `ecv-grad-${uid}`;
  const word = dark ? "#fafaf6" : "#0a0a0a";
  const gap = dark ? "rgba(250,250,246,0.14)" : "rgba(10,10,10,0.14)";
  return (
    <svg
      className="ecv-loader ld-scan"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="12" height="6.5" rx="2" />
          <rect x="16" y="0" width="12" height="6.5" rx="2" />
          <rect x="32" y="0" width="8" height="6.5" rx="2" />
          <rect x="0" y="11.2" width="16" height="6.5" rx="2" />
          <rect x="20" y="11.2" width="18" height="6.5" rx="2" />
          <rect x="0" y="22.4" width="7" height="6.5" rx="2" />
          <rect x="11" y="22.4" width="16" height="6.5" rx="2" />
          <rect x="30" y="22.4" width="8" height="6.5" rx="2" />
          <rect x="0" y="33.5" width="22" height="6.5" rx="2" />
          <rect x="26" y="33.5" width="9" height="6.5" rx="2" />
        </clipPath>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6ff3a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#c6ff3a" />
          <stop offset="1" stopColor="#c6ff3a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        <rect x="0" y="0" width="12" height="6.5" rx="2" fill={word} />
        <rect x="16" y="0" width="12" height="6.5" rx="2" fill={word} />
        <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill={word} />
        <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill={word} />
        <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill={word} />
        <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill={word} />
        <rect x="26" y="33.5" width="9" height="6.5" rx="2" fill={gap} />
      </g>
      <g clipPath={`url(#${clipId})`}>
        <rect
          className="scanband"
          x="-2"
          y="0"
          width="44"
          height="9"
          fill={`url(#${gradId})`}
        />
      </g>
    </svg>
  );
}

// ── B · BUILD ── barras digitam da esquerda, linha a linha (transições de rota)
export function EcvBuildLoader({
  size = 64,
  dark = false,
}: {
  size?: number;
  dark?: boolean;
}) {
  const word = dark ? "#fafaf6" : "#0a0a0a";
  const gap = dark ? "rgba(250,250,246,0.14)" : "rgba(10,10,10,0.14)";
  return (
    <svg
      className="ecv-loader ld-build"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <rect x="0" y="0" width="12" height="6.5" rx="2" fill={word} />
      <rect x="16" y="0" width="12" height="6.5" rx="2" fill={word} />
      <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
      <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
      <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill={word} />
      <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill={word} />
      <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
      <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill={word} />
      <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill={word} />
      <rect x="26" y="33.5" width="9" height="6.5" rx="2" fill={gap} />
    </svg>
  );
}

// ── C · PULSE ── keywords verdes respiram, gap pisca (esperas longas)
export function EcvPulseLoader({
  size = 64,
  dark = false,
}: {
  size?: number;
  dark?: boolean;
}) {
  const word = dark ? "#fafaf6" : "#0a0a0a";
  return (
    <svg
      className="ecv-loader ld-pulse"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <rect x="0" y="0" width="12" height="6.5" rx="2" fill={word} />
      <rect x="16" y="0" width="12" height="6.5" rx="2" fill={word} />
      <rect className="kw k1" x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
      <rect className="kw k2" x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
      <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill={word} />
      <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill={word} />
      <rect className="kw k3" x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
      <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill={word} />
      <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill={word} />
      <rect className="gap" x="26" y="33.5" width="9" height="6.5" rx="2" fill={word} />
    </svg>
  );
}
