/**
 * A minimal SVG sparkline: one thin line, a soft fill, a dot on the newest
 * value. No axes, no library. Values are drawn in order, oldest → newest.
 */
export interface SparklineProps {
  values: readonly number[];
  width?: number;
  height?: number;
  color: string;
  /** Lower bound of the value scale (default: 0, so counts read against zero). */
  floor?: number | null;
  className?: string;
  title?: string;
}

export function sparklinePath(values: readonly number[], width: number, height: number, floor: number | null): { line: string; area: string; last: { x: number; y: number } | null } {
  const n = values.length;
  if (n === 0) return { line: '', area: '', last: null };
  let min = floor ?? Infinity;
  let max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  if (!(max > min)) { max = min + 1; }
  const pad = 2;
  const innerH = height - pad * 2;
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;
  const px = (i: number) => (n > 1 ? pad + i * stepX : width / 2);
  const py = (v: number) => pad + innerH - ((v - min) / (max - min)) * innerH;
  let line = '';
  for (let i = 0; i < n; i++) {
    line += `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)} ${py(values[i]!).toFixed(1)}`;
  }
  const area = `${line}L${px(n - 1).toFixed(1)} ${(height - pad).toFixed(1)}L${px(0).toFixed(1)} ${(height - pad).toFixed(1)}Z`;
  return { line, area, last: { x: px(n - 1), y: py(values[n - 1]!) } };
}

export function Sparkline({ values, width = 120, height = 28, color, floor = 0, className, title }: SparklineProps) {
  const { line, area, last } = sparklinePath(values, width, height, floor);
  return (
    <svg
      className={`spark${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {area ? <path d={area} fill={color} opacity={0.12} /> : null}
      {line ? <path d={line} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
      {last ? <circle cx={last.x} cy={last.y} r={1.8} fill={color} /> : null}
    </svg>
  );
}
