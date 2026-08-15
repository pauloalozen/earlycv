import { AT } from "./admin-primitives";

type SparklineProps = {
  height?: number;
  points: number[];
  width?: number;
};

export function Sparkline({
  points,
  width = 160,
  height = 36,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg height={height} role="img" width={width}>
        <title>Sem dados no período selecionado</title>
      </svg>
    );
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const pad = 3;

  const coords = points.map((value, i) => {
    const x = points.length > 1 ? i * stepX : width / 2;
    const y =
      max === min
        ? height / 2
        : pad + (1 - (value - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      height={height}
      role="img"
      style={{ display: "block", overflow: "visible" }}
      width={width}
    >
      <title>Evolução no período selecionado</title>
      <path d={areaPath} fill={AT.ink2} opacity={0.06} />
      <path d={linePath} fill="none" stroke={AT.ink2} strokeWidth={1.5} />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        fill={AT.ink2}
        r={2}
      />
    </svg>
  );
}
