import type { CurvePoint } from "./api";

export interface Level { price: number; size: number; total: number }

/** Cumulative base available up to `price`, linearly interpolated along a depth curve. */
export function cumAt(pts: CurvePoint[], price: number, side: "ask" | "bid"): number {
  if (!pts.length) return 0;
  const sorted = [...pts].sort((a, b) => (side === "ask" ? a.price - b.price : b.price - a.price) || a.base - b.base);
  const beyond = (p: number) => (side === "ask" ? p > price + 1e-12 : p < price - 1e-12);
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]!;
    if (!beyond(b.price)) continue;
    if (i === 0) return 0;
    const a = sorted[i - 1]!;
    return b.price === a.price ? a.base : a.base + ((b.base - a.base) * (price - a.price)) / (b.price - a.price);
  }
  return sorted[sorted.length - 1]!.base;
}

/** Buckets a depth curve into order-book rows of width `tick`, starting at the best price. */
export function toLevels(pts: CurvePoint[], side: "ask" | "bid", tick: number, n: number): Level[] {
  if (!pts.length) return [];
  const best = side === "ask" ? Math.min(...pts.map((p) => p.price)) : Math.max(...pts.map((p) => p.price));
  const edge = side === "ask" ? Math.max(...pts.map((p) => p.price)) : Math.min(...pts.map((p) => p.price));
  const k = 1e9;
  // Snap the first bucket to the tick grid on the far side of the best price.
  const start = side === "ask" ? Math.floor((best * k) / (tick * k)) * tick : Math.ceil((best * k) / (tick * k)) * tick;
  const out: Level[] = [];
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const hi = side === "ask" ? start + tick * (i + 1) : start - tick * (i + 1);
    const tot = cumAt(pts, hi, side);
    const size = tot - prev;
    const price = side === "ask" ? start + tick * i : start - tick * i;
    if (size > 1e-9) out.push({ price: +price.toFixed(6), size, total: tot });
    prev = tot;
    if (side === "ask" ? hi > edge : hi < edge) break;
  }
  return out;
}

export const TICKS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
export const tickDigits = (t: number) => Math.max(0, -Math.floor(Math.log10(t) + 1e-9));

/** Compact amount: 816.36 → "816.36", 12_430 → "12.43K". */
export function compact(n: number, digits = 2): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(digits)}K`;
  if (a >= 100) return n.toFixed(Math.min(digits, 2));
  if (a >= 1) return n.toFixed(Math.max(digits, 3));
  return n.toFixed(4);
}
