/**
 * Optimal split of a trade across curve positions.
 *
 * Allocation uses marginal-price water-filling: find the common marginal price p* at
 * which the positions together supply the requested base size, give each position what
 * it supplies at p*, and share the remainder among positions whose supply jumps at p*
 * (limit orders). Float maths is only used to *allocate*; every leg is then priced with
 * the exact integer port of the contract maths, so quotes match settlement.
 */
import { askFill, bidCapacity, bidFill, CurveError, sideFromJson, value, type Side } from "@ebbflow/curve-math";
import type { Market, PositionView, SwapSide } from "./types.js";

export const MAX_LEGS = 8;
const BISECT_STEPS = 200;

export class RouteError extends Error {
  constructor(
    public readonly code: "INSUFFICIENT_LIQUIDITY" | "INVALID_REQUEST",
    message: string,
    /** Base available to this request (for INSUFFICIENT_LIQUIDITY). */
    public readonly available?: bigint,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export interface Candidate {
  position_id: string;
  owner_id: string;
  side: Side;
  /** Base this side can fill in total. */
  capacity: bigint;
}

export interface RouteLeg {
  position_id: string;
  owner_id: string;
  base: bigint;
  quote: bigint;
  new_price: bigint;
  start_price: bigint;
}

export interface Route {
  side: SwapSide;
  legs: RouteLeg[];
  base_total: bigint;
  quote_total: bigint;
  /** Best marginal price in the book before the trade. */
  best_price: bigint;
}

export interface RouteOptions {
  maxLegs?: number;
  /** Skip positions owned by this account (no self-trading). */
  excludeOwner?: string;
}

/** Sides that can trade in direction `side`, best price first. */
export function candidates(
  positions: PositionView[],
  market: Market,
  side: SwapSide,
  opts: RouteOptions = {},
): Candidate[] {
  const unit = 10n ** BigInt(market.base_decimals);
  const out: Candidate[] = [];
  for (const p of positions) {
    if (p.market_id !== market.market_id || p.owner_id === opts.excludeOwner) continue;
    const raw = side === "buy_base" ? p.ask : p.bid;
    if (!raw) continue;
    const s = sideFromJson(raw);
    const capacity = side === "buy_base" ? s.remaining : bidCapacity(s, unit);
    // Skip dust: a side whose whole capacity is worth less than one atomic quote unit.
    if (capacity > 0n && value(capacity, s.current_price, unit, false) > 0n) {
      out.push({ position_id: p.position_id, owner_id: p.owner_id, side: s, capacity });
    }
  }
  // Asks: cheapest first. Bids: highest first.
  out.sort((a, b) => {
    const d = a.side.current_price - b.side.current_price;
    const ord = side === "buy_base" ? d : -d;
    return ord < 0n ? -1 : ord > 0n ? 1 : 0;
  });
  return out;
}

/** Fraction of its capacity a side supplies if its marginal price may move up (ask) / down (bid) to `p`. */
function fractionAt(side: SwapSide, c: Candidate, p: number): number {
  const pc = Number(c.side.current_price);
  const pe = Number(c.side.end_price);
  const k = c.side.alpha + 1;
  if (side === "buy_base") {
    if (p < pc) return 0;
    if (pe === pc) return 1;
    return Math.min(1, ((p - pc) / (pe - pc)) ** (1 / k));
  }
  if (p > pc) return 0;
  if (pe === pc) return 1;
  return Math.min(1, ((pc - p) / (pc - pe)) ** (1 / k));
}

/** Base a side supplies at `p`, as a float (for searching). */
function supplyAt(side: SwapSide, c: Candidate, p: number): number {
  return fractionAt(side, c, p) * Number(c.capacity);
}

/**
 * Base a side supplies at `p`, in exact units. A fully consumed side gets its exact
 * capacity: going through a float would drop low bits and strand dust in the position.
 */
function allocAt(side: SwapSide, c: Candidate, p: number): bigint {
  const f = fractionAt(side, c, p);
  return f >= 1 ? c.capacity : floorBig(f * Number(c.capacity), c.capacity);
}

function floorBig(x: number, max: bigint): bigint {
  if (!(x > 0)) return 0n;
  const v = BigInt(Math.floor(x));
  return v > max ? max : v;
}

function sum(xs: bigint[]): bigint {
  return xs.reduce((a, b) => a + b, 0n);
}

/** Base allocation per candidate summing exactly to `size`. Requires Σ capacity ≥ size. */
export function allocate(side: SwapSide, cs: Candidate[], size: bigint): bigint[] {
  const total = (p: number) => cs.reduce((acc, c) => acc + supplyAt(side, c, p), 0);
  const target = Number(size);
  const pcs = cs.map((c) => Number(c.side.current_price));
  const pes = cs.map((c) => Number(c.side.end_price));

  // `under` supplies less than the target, `over` at least the target.
  let under: number;
  let over: number;
  if (side === "buy_base") {
    under = Math.min(...pcs) * (1 - 1e-12) - 1;
    over = Math.max(...pes, ...pcs);
  } else {
    under = Math.max(...pcs) * (1 + 1e-12) + 1;
    over = Math.min(...pes, ...pcs);
  }
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (under + over) / 2;
    if (mid === under || mid === over) break;
    if (total(mid) >= target) over = mid;
    else under = mid;
  }

  const alloc = cs.map((c) => allocAt(side, c, under));
  let rem = size - sum(alloc);
  if (rem < 0n) {
    // Float noise overshot: trim from the worst-priced legs.
    for (let i = cs.length - 1; i >= 0 && rem < 0n; i--) {
      const take = alloc[i]! < -rem ? alloc[i]! : -rem;
      alloc[i] = alloc[i]! - take;
      rem += take;
    }
  }

  // Share the remainder among positions whose supply grows between `under` and `over`
  // (limit orders sitting exactly at p*, and curves at the margin), pro rata.
  const deltas = cs.map((c) => Math.max(0, supplyAt(side, c, over) - supplyAt(side, c, under)));
  const deltaTotal = deltas.reduce((a, b) => a + b, 0);
  if (rem > 0n && deltaTotal > 0) {
    const remF = Number(rem);
    cs.forEach((c, i) => {
      const give = floorBig((remF * deltas[i]!) / deltaTotal, c.capacity - alloc[i]!);
      const g = give > rem ? rem : give;
      alloc[i] = alloc[i]! + g;
      rem -= g;
    });
  }
  // Any rounding leftover goes to the best-priced positions with spare capacity.
  for (let i = 0; i < cs.length && rem > 0n; i++) {
    const spare = cs[i]!.capacity - alloc[i]!;
    const g = spare < rem ? spare : rem;
    alloc[i] = alloc[i]! + g;
    rem -= g;
  }
  if (rem !== 0n) throw new RouteError("INSUFFICIENT_LIQUIDITY", "not enough liquidity", sum(cs.map((c) => c.capacity)));
  return alloc;
}

/** Prices one leg exactly as the contract will. */
function priceLeg(side: SwapSide, c: Candidate, base: bigint, unit: bigint): RouteLeg {
  const f = side === "buy_base" ? askFill(c.side, unit, base) : bidFill(c.side, unit, base);
  return {
    position_id: c.position_id,
    owner_id: c.owner_id,
    base,
    quote: f.quote,
    new_price: f.new_price,
    start_price: c.side.current_price,
  };
}

/** Route for an exact base size (buy: receive `size` base; sell: send `size` base). */
export function routeExactBase(
  positions: PositionView[],
  market: Market,
  side: SwapSide,
  size: bigint,
  opts: RouteOptions = {},
): Route {
  if (size <= 0n) throw new RouteError("INVALID_REQUEST", "amount must be positive");
  const maxLegs = opts.maxLegs ?? MAX_LEGS;
  const unit = 10n ** BigInt(market.base_decimals);
  let cs = candidates(positions, market, side, opts);
  const available = sum(cs.map((c) => c.capacity));
  if (cs.length === 0 || available < size) {
    throw new RouteError("INSUFFICIENT_LIQUIDITY", "not enough liquidity for this size", available);
  }
  const best = cs[0]!.side.current_price;

  let alloc = allocate(side, cs, size);
  if (alloc.filter((a) => a > 0n).length > maxLegs) {
    // Keep the positions contributing most at p*, then re-allocate among them.
    const keep = cs
      .map((c, i) => ({ c, a: alloc[i]! }))
      .sort((x, y) => (y.a > x.a ? 1 : y.a < x.a ? -1 : 0))
      .slice(0, maxLegs)
      .map((x) => x.c);
    cs = cs.filter((c) => keep.includes(c));
    const capped = sum(cs.map((c) => c.capacity));
    if (capped < size) {
      throw new RouteError("INSUFFICIENT_LIQUIDITY", `size needs more than ${maxLegs} makers`, capped);
    }
    alloc = allocate(side, cs, size);
  }

  const legs: RouteLeg[] = [];
  cs.forEach((c, i) => {
    if (alloc[i]! > 0n) legs.push(priceLeg(side, c, alloc[i]!, unit));
  });
  return {
    side,
    legs,
    base_total: sum(legs.map((l) => l.base)),
    quote_total: sum(legs.map((l) => l.quote)),
    best_price: best,
  };
}

/** Buy route spending at most `budget` quote: the largest base size whose exact cost fits. */
export function routeBuyWithQuote(
  positions: PositionView[],
  market: Market,
  budget: bigint,
  opts: RouteOptions = {},
): Route {
  if (budget <= 0n) throw new RouteError("INVALID_REQUEST", "amount must be positive");
  const cs = candidates(positions, market, "buy_base", opts);
  let lo = 0n;
  let hi = sum(cs.map((c) => c.capacity));
  let best: Route | undefined;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    let r: Route | undefined;
    try {
      r = routeExactBase(positions, market, "buy_base", mid, opts);
    } catch (e) {
      if (!(e instanceof RouteError) && !(e instanceof CurveError)) throw e;
    }
    if (r && r.quote_total <= budget) {
      lo = mid;
      best = r;
    } else {
      hi = mid - 1n;
    }
  }
  if (!best) throw new RouteError("INSUFFICIENT_LIQUIDITY", "budget too small for any fill", 0n);
  return best;
}
