type ProgressRingProps = {
  value: number;
  size?: number;
  stroke?: number;
};

export function ProgressRing({
  value,
  size = 96,
  stroke = 9,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  // Tamanho do texto escala com o anel — hardcoded em text-lg/8.5px só
  // coube confortavelmente no tamanho default (96px); em usos menores
  // (ex.: 64px) o número quase encostava no traço do anel.
  const valueFontSize = Math.max(11, Math.round(size * 0.2));
  const labelFontSize = Math.max(7, Math.round(size * 0.1));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(10,10,10,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2a6a10"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(2)} ${c.toFixed(2)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold leading-none tracking-tight tabular-nums text-[#0a0a0a]"
          style={{ fontSize: valueFontSize }}
        >
          {value}%
        </span>
        <span
          className="mt-0.5 font-mono tracking-[0.06em] text-[#8a8a85]"
          style={{ fontSize: labelFontSize }}
        >
          COMPLETO
        </span>
      </div>
    </div>
  );
}
