"use client";
import { createContext, useContext, type ReactNode } from "react";
import { getCurves, getMarkets, postQuote, type CurvePoint, type CurvesResponse, type MarketRow, type Quote } from "@/lib/api";
import { cumAt } from "@/lib/book";
import { MARKET } from "@/lib/config";
import { usePolling } from "@/lib/usePolling";

/** The size of the example trade the landing objects show: a real quote, refreshed every 30s. */
export const DEMO_BUY = "2";

interface Live { row: MarketRow | null; curves: CurvesResponse | null; quote: Quote | null }
const Ctx = createContext<Live>({ row: null, curves: null, quote: null });

/** One poll of the book for every landing object, so they all show the same moment. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const markets = usePolling(() => getMarkets(), [], 30000);
  const curves = usePolling(() => getCurves(MARKET.market_id, 60), [], 30000);
  const quote = usePolling(() => postQuote({ market_id: MARKET.market_id, side: "buy_base", base_amount: DEMO_BUY, slippage_bps: 50 }), [], 30000);
  const row = markets.data?.find((m) => m.market_id === MARKET.market_id) ?? null;
  return <Ctx.Provider value={{ row, curves: curves.data, quote: quote.data }}>{children}</Ctx.Provider>;
}
export const useLive = () => useContext(Ctx);

export const shortName = (id: string) => id.replace(/\.(testnet|near)$/, "").replace(/^ebbflow-team-/, "");
export const fmt = (s: string | number | null | undefined, dp = 4) => (s == null || s === "" ? "—" : Number(s).toFixed(dp));

/**
 * Cumulative depth across the book, sampled left to right: bids rise toward the left edge, asks
 * toward the right, flat in the spread at the middle. Square-rooted so thin books still show shape.
 */
export function depthProfile(depth: { asks: CurvePoint[]; bids: CurvePoint[] } | undefined, samples: number): number[] | null {
  if (!depth?.asks.length || !depth.bids.length) return null;
  const { asks, bids } = depth;
  const bestA = Math.min(...asks.map((p) => p.price)), farA = Math.max(...asks.map((p) => p.price));
  const bestB = Math.max(...bids.map((p) => p.price)), farB = Math.min(...bids.map((p) => p.price));
  const maxA = cumAt(asks, farA, "ask") || 1, maxB = cumAt(bids, farB, "bid") || 1;
  const raw = Array.from({ length: samples + 1 }, (_, k) => {
    const u = k / samples, t = (Math.abs(u - 0.5) - 0.04) / 0.46;
    if (t <= 0) return 0;
    return u > 0.5 ? Math.sqrt(cumAt(asks, bestA + t * (farA - bestA), "ask") / maxA) : Math.sqrt(cumAt(bids, bestB - t * (bestB - farB), "bid") / maxB);
  });
  let out = raw; // soften limit-order walls so the shape bends instead of stepping
  const r = Math.max(2, Math.round(samples / 14));
  for (let pass = 0; pass < 3; pass++) out = out.map((_, k) => { let s = 0, n = 0; for (let j = k - r; j <= k + r; j++) if (j >= 0 && j <= samples) { s += out[j]!; n++; } return s / n; });
  return out;
}
