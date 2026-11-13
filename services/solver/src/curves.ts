/** Chart data: per-position curves and aggregated depth for the web app. */
import { askFill, bidFill, formatPrice, formatUnits, type Side } from "@ebbflow/curve-math";
import { candidates, type Candidate } from "./router.js";
import type { Market, PositionView, SwapSide } from "./types.js";

export interface CurvePoint {
  /** Cumulative base filled from the current price (whole tokens). */
  base: number;
  /** Marginal price after that much is filled (quote per base). */
  price: number;
}

export interface PositionCurve {
  position_id: string;
  owner_id: string;
  side: "ask" | "bid";
  alpha: number;
  points: CurvePoint[];
}

function toNum(v: bigint, decimals: number): number {
  return Number(formatUnits(v, decimals, 12));
}

function priceNum(p: bigint, quoteDecimals: number): number {
  return Number(formatPrice(p, quoteDecimals, 12));
}

function samplePosition(dir: SwapSide, c: Candidate, market: Market, points: number): CurvePoint[] {
  const unit = 10n ** BigInt(market.base_decimals);
  const fill = (s: Side, b: bigint) => (dir === "buy_base" ? askFill(s, unit, b) : bidFill(s, unit, b));
  const out: CurvePoint[] = [{ base: 0, price: priceNum(c.side.current_price, market.quote_decimals) }];
  for (let i = 1; i <= points; i++) {
    const b = (c.capacity * BigInt(i)) / BigInt(points);
    if (b === 0n) continue;
    out.push({
      base: toNum(b, market.base_decimals),
      price: priceNum(fill(c.side, b).new_price, market.quote_decimals),
    });
  }
  return out;
}

/** Cumulative base available across all positions at each price level. */
function depth(dir: SwapSide, cs: Candidate[], market: Market, points: number): CurvePoint[] {
  if (cs.length === 0) return [];
  const qd = market.quote_decimals;
  const lo = priceNum(cs[0]!.side.current_price, qd);
  const far = cs.map((c) => priceNum(c.side.end_price, qd));
  const hi = dir === "buy_base" ? Math.max(...far) : Math.min(...far);
  const out: CurvePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const p = lo + ((hi - lo) * i) / points;
    let base = 0;
    for (const c of cs) {
      const pc = priceNum(c.side.current_price, qd);
      const pe = priceNum(c.side.end_price, qd);
      const cap = toNum(c.capacity, market.base_decimals);
      const k = c.side.alpha + 1;
      const reached = dir === "buy_base" ? p >= pc : p <= pc;
      if (!reached) continue;
      base += pe === pc ? cap : Math.min(1, (Math.abs(p - pc) / Math.abs(pe - pc)) ** (1 / k)) * cap;
    }
    out.push({ base, price: p });
  }
  return out;
}

export function curves(positions: PositionView[], market: Market, points: number) {
  const asks = candidates(positions, market, "buy_base");
  const bids = candidates(positions, market, "sell_base");
  return {
    market_id: market.market_id,
    best_ask: asks[0] ? formatPrice(asks[0].side.current_price, market.quote_decimals) : null,
    best_bid: bids[0] ? formatPrice(bids[0].side.current_price, market.quote_decimals) : null,
    positions: [
      ...asks.map<PositionCurve>((c) => ({
        position_id: c.position_id,
        owner_id: c.owner_id,
        side: "ask",
        alpha: c.side.alpha,
        points: samplePosition("buy_base", c, market, points),
      })),
      ...bids.map<PositionCurve>((c) => ({
        position_id: c.position_id,
        owner_id: c.owner_id,
        side: "bid",
        alpha: c.side.alpha,
        points: samplePosition("sell_base", c, market, points),
      })),
    ],
    depth: {
      asks: depth("buy_base", asks, market, points),
      bids: depth("sell_base", bids, market, points),
    },
  };
}

export function summary(positions: PositionView[], market: Market) {
  const asks = candidates(positions, market, "buy_base");
  const bids = candidates(positions, market, "sell_base");
  const sumBig = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
  return {
    best_ask: asks[0] ? formatPrice(asks[0].side.current_price, market.quote_decimals) : null,
    best_bid: bids[0] ? formatPrice(bids[0].side.current_price, market.quote_decimals) : null,
    positions: positions.filter((p) => p.market_id === market.market_id).length,
    depth_base_ask: formatUnits(sumBig(asks.map((c) => c.capacity)), market.base_decimals, 6),
    depth_quote_bid: formatUnits(sumBig(bids.map((c) => c.side.remaining)), market.quote_decimals, 6),
  };
}
