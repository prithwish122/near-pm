"use client";
import { useRef, useState } from "react";

export interface Series { key: string; label: string; color: string; pts: [number, number][]; area?: boolean; dash?: boolean; width?: number }

const W = 640, H = 280, L = 52, R = 14, T = 12, B = 34;

const nice = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3));

/** y of a series at price x (step/linear interpolation); null outside its price range. */
function valueAt(pts: [number, number][], x: number): number | null {
  if (!pts.length || x < pts[0]![0] - 1e-12) return null;
  let best: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    if (Math.abs(x1 - x) < 1e-12) best = Math.max(best ?? 0, y1);
    const next = pts[i + 1];
    if (next && x1 <= x && x <= next[0] && next[0] > x1) best = y1 + ((next[1] - y1) * (x - x1)) / (next[0] - x1);
  }
  return best ?? pts[pts.length - 1]![1];
}

/** Depth-style chart: price on x, cumulative size on y. A limit order is a vertical bar. */
export default function DepthPlot({ series, xLabel, yLabel, empty = "No liquidity yet" }: { series: Series[]; xLabel: string; yLabel: string; empty?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-white/15 text-[12px] text-white/45">{empty}</div>;

  let xmin = Math.min(...all.map((p) => p[0])), xmax = Math.max(...all.map((p) => p[0]));
  if (xmax - xmin < 1e-9) { const d = Math.max(Math.abs(xmin) * 0.01, 0.01); xmin -= d; xmax += d; }
  const pad = (xmax - xmin) * 0.04; xmin -= pad; xmax += pad;
  const ymax = Math.max(...all.map((p) => p[1])) * 1.1 || 1;
  const sx = (x: number) => L + ((x - xmin) / (xmax - xmin)) * (W - L - R);
  const sy = (y: number) => H - B - (y / ymax) * (H - T - B);
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const xt = Array.from({ length: 5 }, (_, i) => xmin + ((xmax - xmin) * i) / 4);
  const yt = Array.from({ length: 5 }, (_, i) => (ymax * i) / 4);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(px < L || px > W - R ? null : xmin + ((px - L) / (W - L - R)) * (xmax - xmin));
  };
  const rows = hover === null ? [] : series.map((s) => ({ s, v: valueAt(s.pts, hover) })).filter((r) => r.v !== null && r.v > 0);

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${yLabel} by ${xLabel}`}>
        {yt.map((v, i) => (
          <g key={i}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="rgba(255,255,255,.07)" /><text x={L - 8} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.45)">{nice(v)}</text></g>
        ))}
        {xt.map((v, i) => <text key={i} x={sx(v)} y={H - B + 16} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.45)">{nice(v)}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.4)">{xLabel}</text>
        <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.4)">{yLabel}</text>
        {series.map((s) => s.pts.length > 0 && (
          <g key={s.key}>
            {s.area && <path d={`${path(s.pts)}L${sx(s.pts[s.pts.length - 1]![0])},${sy(0)}L${sx(s.pts[0]![0])},${sy(0)}Z`} fill={s.color} opacity=".14" />}
            <path d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash ? "4 3" : undefined} strokeLinejoin="round" />
          </g>
        ))}
        {hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={T} y2={H - B} stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />}
      </svg>
      {hover !== null && rows.length > 0 && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/10 bg-[#0b1f15]/95 p-2.5 text-[11px] shadow-xl">
          <p className="mb-1 text-white/60">Price {nice(hover)}</p>
          {rows.map(({ s, v }) => (
            <p key={s.key} className="flex items-center gap-2 tabular-nums"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}: {nice(v!)}</p>
          ))}
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/60">
        {series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color, opacity: s.dash ? 0.6 : 1 }} />{s.label}</li>)}
      </ul>
    </div>
  );
}
