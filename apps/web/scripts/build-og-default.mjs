// Monta o og-default.png a partir dos assets reais da marca (ícone SVG e wordmark
// em Geist, copiados de src/components/logo.tsx), sem depender de geração por IA.
// Uso: node scripts/build-og-default.mjs
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;

const BG = "#f9f8f4";
const INK = "#0a0a0a";
const LIME = "#c6ff3a";
const DIMMED = "rgba(10,10,10,0.14)";
const TAGLINE_COLOR = "#57534e";

// Ícone: mesmos 10 <rect> de src/components/logo.tsx (viewBox 0 0 40 40),
// escalado para 96px e posicionado à esquerda do wordmark.
const ICON_SCALE = 96 / 40;
const iconRects = `
  <rect x="0" y="0" width="12" height="6.5" rx="2" fill="${INK}" />
  <rect x="16" y="0" width="12" height="6.5" rx="2" fill="${INK}" />
  <rect x="32" y="0" width="8" height="6.5" rx="2" fill="${LIME}" />
  <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="${LIME}" />
  <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill="${INK}" />
  <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill="${INK}" />
  <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="${LIME}" />
  <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill="${INK}" />
  <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill="${INK}" />
  <rect x="26" y="33.5" width="9" height="6.5" rx="2" fill="${DIMMED}" />
`;

const iconWidth = 40 * ICON_SCALE;
const iconHeight = 40 * ICON_SCALE;
const wordmarkFontSize = 88;
const gap = 28;

// Largura aproximada do wordmark "earlyCV" no tamanho acima, para centralizar o
// bloco (ícone + texto) no canvas. Medida a olho a partir do render local.
const wordmarkWidth = 430;
const blockWidth = iconWidth + gap + wordmarkWidth;
const blockX = (WIDTH - blockWidth) / 2;
const iconY = HEIGHT / 2 - iconHeight / 2 - 24;

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}" />

  <g transform="translate(${blockX}, ${iconY}) scale(${ICON_SCALE})">
    ${iconRects}
  </g>

  <text
    x="${blockX + iconWidth + gap}"
    y="${iconY + iconHeight / 2}"
    dominant-baseline="central"
    font-family="Geist"
    font-size="${wordmarkFontSize}"
  >
    <tspan font-weight="300" fill="${INK}" letter-spacing="-2">early</tspan><tspan font-weight="700" fill="${INK}" letter-spacing="-2">CV</tspan>
  </text>

  <text
    x="${WIDTH / 2}"
    y="${iconY + iconHeight + 74}"
    text-anchor="middle"
    font-family="Geist"
    font-weight="300"
    font-size="32"
    fill="${TAGLINE_COLOR}"
  >Adapte seu currículo para cada vaga</text>
</svg>
`;

await sharp(Buffer.from(svg)).png().toFile("public/og-default.png");
console.log("public/og-default.png gerado a partir dos assets reais da marca.");
