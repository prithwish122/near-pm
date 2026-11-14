"use client";
import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cumAt } from "@/lib/book";

type Pt = { price: number; base: number };
interface Slice { a: number; b: number; v: number }

interface Props {
  /** Cumulative bid depth (base buyable) by price. */
  bids: Pt[];
  /** Cumulative ask depth (base for sale) by price. */
  asks: Pt[];
  mid?: number | null;
  baseSymbol: string;
  quoteSymbol?: string;
  bidCaption?: string;
  askCaption?: string;
  /** Highlights the slices an order eats through, from the best price to `to`. */
  fill?: { side: "ask" | "bid"; to: number; label?: string } | null;
  buckets?: number;
  minHeight?: number;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, set] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => set({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}K` : n >= 10 ? n.toFixed(1) : n.toFixed(3));
const BID = "#5ccf94", ASK = "#e8687e";

/** Slices one side into equal price steps anchored at its best price, so the first slice starts exactly there. */
function slices(pts: Pt[], kind: "ask" | "bid", step: number): Slice[] {
  if (!pts.length) return [];
  const best = kind === "ask" ? Math.min(...pts.map((p) => p.price)) : Math.max(...pts.map((p) => p.price));
  const edge = kind === "ask" ? Math.max(...pts.map((p) => p.price)) : Math.min(...pts.map((p) => p.price));
  const n = Math.max(1, Math.ceil(Math.abs(edge - best) / step - 1e-9));
  return Array.from({ length: n }, (_, i) => {
    const near = kind === "ask" ? best + step * i : best - step * i;
    const far = kind === "ask" ? near + step : near - step;
    const v = Math.max(0, cumAt(pts, far, kind) - cumAt(pts, near - (kind === "ask" ? 1e-12 : -1e-12), kind));
    return kind === "ask" ? { a: near, b: far, v } : { a: far, b: near, v };
  });
}

/**
 * Liquidity by price. Each side is a plateau of how much base trades in each price slice, anchored at
 * its best price. Sides scale independently (bids are funded in quote, so they hold far more base);
 * the call-outs carry the real totals. Fills the height of its container.
 */
export default function LiquidityChart({ bids, asks, mid, baseSymbol, quoteSymbol = "", bidCaption, askCaption, fill, buckets = 34, minHeight = 260 }: Props) {
  const [box, { w, h }] = useSize<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const [hx, setHx] = useState<number | null>(null);

  const prices = [...bids, ...asks].map((p) => p.price);
  if (!prices.length) return <div ref={box} className="grid h-full place-items-center text-[12px] text-white/40" style={{ minHeight }}>No liquidity yet</div>;

  let lo = Math.min(...prices), hi = Math.max(...prices);
  const step = (hi - lo) / buckets || 0.005;
  const pad = (hi - lo) * 0.03 || 0.05; lo -= pad; hi += pad;
  const sb = slices(bids, "bid", step);
  const sa = slices(asks, "ask", step);
  const maxB = Math.max(1e-12, ...sb.map((c) => c.v));
  const maxA = Math.max(1e-12, ...sa.map((c) => c.v));
  const bestBid = bids.length ? Math.max(...bids.map((p) => p.price)) : null;
  const bestAsk = asks.length ? Math.min(...asks.map((p) => p.price)) : null;
  const centre = mid ?? (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : (lo + hi) / 2);

  const T = 84, B = 28, L = 8, R = 8;
  const W = Math.max(w, 10), H = Math.max(h, minHeight);
  const sx = (x: number) => L + ((x - lo) / (hi - lo)) * (W - L - R);
  const px = (X: number) => lo + ((X - L) / (W - L - R)) * (hi - lo);
  const sy = (v: number) => H - B - v * (H - T - B);
  const floor = sy(0);

  /** Plateau outline + area for a run of slices (ordered by price). */
  const shape = (cs: Slice[], max: number) => {
    const s = [...cs].sort((x, y) => x.a - y.a).filter((c) => c.v > 1e-12);
    if (!s.length) return null;
    const inset = Math.min(2, (sx(s[0]!.b) - sx(s[0]!.a)) * 0.15);
    let line = "";
    s.forEach((c, i) => {
      const y = sy((c.v / max) * 0.9).toFixed(1);
      line += `${i ? "L" : "M"}${(sx(c.a) + (i ? inset : 0)).toFixed(1)},${y}L${(sx(c.b) - inset).toFixed(1)},${y}`;
    });
    const area = `M${sx(s[0]!.a).toFixed(1)},${floor}L${line.slice(1)}L${sx(s[s.length - 1]!.b).toFixed(1)},${floor}Z`;
    return { line, area };
  };
  const pb = shape(sb, maxB);
  const pa = shape(sa, maxA);

  // The order's fill: slices between the best price and `fill.to`.
  const fillSlices = fill ? (fill.side === "ask" ? sa.filter((c) => c.a < fill.to - 1e-12) : sb.filter((c) => c.b > fill.to + 1e-12)) : [];
  const clipFill = fill ? (fill.side === "ask" ? { x: sx(bestAsk ?? lo), x2: sx(fill.to) } : { x: sx(fill.to), x2: sx(bestBid ?? hi) }) : null;

  // Hover: cumulative size and cost of sweeping from the best price to the cursor.
  const hp = hx != null ? px(hx) : null;
  const hSide: "ask" | "bid" | null = hp == null ? null : bestAsk != null && hp >= bestAsk ? "ask" : bestBid != null && hp <= bestBid ? "bid" : null;
  let sweep: { base: number; cost: number } | null = null;
  if (hp != null && hSide) {
    const cs = hSide === "ask" ? sa.filter((c) => c.a < hp) : sb.filter((c) => c.b > hp);
    let base = 0, cost = 0;
    for (const c of cs) {
      const part = hSide === "ask" ? Math.min(1, (hp - c.a) / (c.b - c.a)) : Math.min(1, (c.b - hp) / (c.b - c.a));
      base += c.v * part; cost += c.v * part * (c.a + c.b) / 2;
    }
    sweep = { base, cost };
  }

  const midX = sx(centre);
  const ease = [0.22, 1, 0.36, 1] as const;

  const Annot = ({ x, align, value, caption, tone }: { x: number; align: "left" | "right"; value: string; caption: string; tone: string }) => (
    <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5, ease }}>
      <line x1={x} x2={x} y1={T - 16} y2={floor} stroke="rgba(255,255,255,.2)" strokeDasharray="1 4" strokeLinecap="round" />
      <circle cx={x} cy={T - 16} r="5" fill={tone} opacity=".18"><animate attributeName="r" values="3;7;3" dur="2.4s" repeatCount="indefinite" /></circle>
      <circle cx={x} cy={T - 16} r="2.5" fill={tone} />
      <text x={align === "right" ? x - 10 : x + 10} y={T - 46} textAnchor={align === "right" ? "end" : "start"} fontSize="28" fontWeight="500" fill="#f4f4f5" className="num" letterSpacing="-0.6">{value}</text>
      <text x={align === "right" ? x - 10 : x + 10} y={T - 25} textAnchor={align === "right" ? "end" : "start"} fontSize="11" fill="rgba(255,255,255,.45)">{caption}</text>
    </motion.g>
  );

  return (
    <div ref={box} className="relative h-full w-full cursor-crosshair select-none" style={{ minHeight }}
      onMouseMove={(e) => { const r = box.current!.getBoundingClientRect(); setHx(e.clientX - r.left); }} onMouseLeave={() => setHx(null)}>
      {w > 0 && (
        <svg width={W} height={H} className="absolute inset-0" role="img" aria-label={`Liquidity by price. Best bid ${bestBid}, best ask ${bestAsk}.`}>
          <defs>
            <linearGradient id={`fb-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={BID} stopOpacity=".16" /><stop offset="1" stopColor={BID} stopOpacity="0" /></linearGradient>
            <linearGradient id={`fa-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={ASK} stopOpacity=".16" /><stop offset="1" stopColor={ASK} stopOpacity="0" /></linearGradient>
            <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.07)" strokeWidth="1" /></pattern>
            {/* reveal outward from the mid price */}
            <clipPath id={`rb-${uid}`}><motion.rect y={0} height={H} initial={{ x: midX, width: 0 }} animate={{ x: 0, width: midX }} transition={{ duration: 1.1, ease }} /></clipPath>
            <clipPath id={`ra-${uid}`}><motion.rect y={0} height={H} initial={{ width: 0 }} animate={{ width: W - midX }} x={midX} transition={{ duration: 1.1, ease }} /></clipPath>
            {clipFill && <clipPath id={`fc-${uid}`}><rect x={Math.min(clipFill.x, clipFill.x2)} width={Math.abs(clipFill.x2 - clipFill.x)} y={0} height={H} /></clipPath>}
          </defs>

          {/* slice guides */}
          {[...sb, ...sa].map((c, i) => i % 3 === 0 && <line key={i} x1={sx(c.a)} x2={sx(c.a)} y1={T} y2={floor} stroke="rgba(255,255,255,.03)" />)}
          <line x1={L} x2={W - R} y1={floor} y2={floor} stroke="rgba(255,255,255,.08)" />

          {/* spread band */}
          {bestBid != null && bestAsk != null && (
            <g>
              <rect x={sx(bestBid)} width={Math.max(0, sx(bestAsk) - sx(bestBid))} y={T + 10} height={floor - T - 10} fill={`url(#hatch-${uid})`} />
              <text x={midX} y={floor - 10} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.4)">spread</text>
              <text x={midX} y={floor - 24} textAnchor="middle" fontSize="11.5" fill="rgba(255,255,255,.7)" className="num">{(((bestAsk - bestBid) / centre) * 100).toFixed(2)}%</text>
            </g>
          )}

          {pb && <g clipPath={`url(#rb-${uid})`}><path d={pb.area} fill={`url(#fb-${uid})`} /><path d={pb.line} fill="none" stroke={BID} strokeWidth="1.5" strokeLinejoin="round" opacity={fill?.side === "ask" ? 0.45 : 1} /></g>}
          {pa && <g clipPath={`url(#ra-${uid})`}><path d={pa.area} fill={`url(#fa-${uid})`} /><path d={pa.line} fill="none" stroke={ASK} strokeWidth="1.5" strokeLinejoin="round" opacity={fill?.side === "bid" ? 0.45 : 1} /></g>}

          {/* your order */}
          {fill && clipFill && fillSlices.length > 0 && (
            <g clipPath={`url(#fc-${uid})`}>
              <path d={(fill.side === "ask" ? pa : pb)!.area} fill={fill.side === "ask" ? ASK : BID} opacity=".28" />
              <path d={(fill.side === "ask" ? pa : pb)!.line} fill="none" stroke="#fafafa" strokeWidth="2" strokeLinejoin="round" />
            </g>
          )}
          {fill && (
            <g>
              <line x1={sx(fill.to)} x2={sx(fill.to)} y1={T + 4} y2={floor} stroke="#fafafa" strokeWidth="1" />
              <rect x={sx(fill.to) + (fill.side === "ask" ? 6 : -146)} y={T + 4} width="140" height="22" rx="11" fill="#fafafa" />
              <text x={sx(fill.to) + (fill.side === "ask" ? 76 : -76)} y={T + 19} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#0a0a0b">{fill.label ?? `Your order fills to ${fill.to.toFixed(4)}`}</text>
            </g>
          )}

          {bestBid != null && <Annot x={sx(bestBid)} align="right" value={bestBid.toFixed(4)} caption={bidCaption ?? "Best bid"} tone={BID} />}
          {bestAsk != null && <Annot x={sx(bestAsk)} align="left" value={bestAsk.toFixed(4)} caption={askCaption ?? "Best ask"} tone={ASK} />}

          {[0, 0.25, 0.5, 0.75, 1].map((t) => { const v = lo + (hi - lo) * t; return <text key={t} x={sx(v)} y={H - 9} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"} fontSize="10" fill="rgba(255,255,255,.32)" className="num">{v.toFixed(3)}</text>; })}

          {hx != null && hx > L && hx < W - R && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={T - 4} y2={floor} stroke="rgba(255,255,255,.4)" />
              <rect x={hx - 30} y={floor + 3} width="60" height="17" rx="8.5" fill="#fafafa" />
              <text x={hx} y={floor + 15} textAnchor="middle" fontSize="10" fontWeight="600" fill="#0a0a0b" className="num">{hp!.toFixed(4)}</text>
            </g>
          )}
        </svg>
      )}
      {hx != null && sweep && sweep.base > 0 && (
        <div className="pointer-events-none absolute z-10 w-[190px] rounded-xl border border-white/10 bg-[#18181b]/95 p-3 text-[11px] shadow-xl backdrop-blur"
          style={{ left: Math.min(hx + 14, W - 204), top: T + 34 }}>
          <p className="text-white/45">{hSide === "ask" ? "Buy" : "Sell"} through this price</p>
          <p className="num mt-1 text-[15px] text-white">{fmt(sweep.base)} <span className="text-[11px] text-white/45">{baseSymbol}</span></p>
          <p className="num mt-0.5 text-white/60">≈ {fmt(sweep.cost)} {quoteSymbol} · avg {(sweep.cost / sweep.base).toFixed(4)}</p>
        </div>
      )}
    </div>
  );
}
