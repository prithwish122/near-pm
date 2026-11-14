/**
 * Worked examples for the docs, computed at build time with @ebbflow/curve-math, the exact integer
 * port of the contract's maths (checked against 400 fixtures exported from the Rust tests).
 * Nothing here is typed by hand: change a parameter and every number in the docs follows.
 */
import {
  askFill, bidCapacity, bidFill, FRAC, formatPrice, formatUnits, newSide, parsePrice, parseUnits, PRICE_SCALE, value,
  type Side,
} from "@ebbflow/curve-math";

export const BASE_DEC = 24;
export const QUOTE_DEC = 6;
export const UNIT = 10n ** BigInt(BASE_DEC);

export const B = (h: string) => parseUnits(h, BASE_DEC);
export const Q = (h: string) => parseUnits(h, QUOTE_DEC);
export const P = (h: string) => parsePrice(h, QUOTE_DEC);
export const fb = (v: bigint, d = 6) => formatUnits(v, BASE_DEC, d);
export const fq = (v: bigint, d = 6) => formatUnits(v, QUOTE_DEC, d);
export const fp = (v: bigint, d = 6) => formatPrice(v, QUOTE_DEC, d);
/** Thousands separators for raw integers. */
export const raw = (v: bigint) => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "_");
const divUp = (a: bigint, b: bigint) => (a % b === 0n ? a / b : a / b + 1n);
/** Average price of a fill, as a scaled price. */
export const avg = (base: bigint, quote: bigint) => (quote * UNIT * PRICE_SCALE) / base;

export { FRAC, PRICE_SCALE };

/* ------------------------------------------------------------------ */
/* The reference book (PRD §7.8): Priya's two-sided curve, Arjun's limit */
/* ------------------------------------------------------------------ */

export const PRIYA = {
  ask: { amount: "400", start: "5.04", end: "5.20", alpha: 1 },
  bid: { amount: "2000", start: "4.96", end: "4.80", alpha: 1 },
};
export const ARJUN = { ask: { amount: "100", start: "5.06", end: "5.06", alpha: 0 } };

export const priyaAsk = (): Side => newSide(B(PRIYA.ask.amount), P(PRIYA.ask.start), P(PRIYA.ask.end), PRIYA.ask.alpha);
export const priyaBid = (): Side => newSide(Q(PRIYA.bid.amount), P(PRIYA.bid.start), P(PRIYA.bid.end), PRIYA.bid.alpha);
export const arjunAsk = (): Side => newSide(B(ARJUN.ask.amount), P(ARJUN.ask.start), P(ARJUN.ask.end), 0);

/* ---------------- price encoding ---------------- */

export const encoding = (() => {
  const price = P("5.04");
  const oneBase = B("1");
  const v = value(oneBase, price, UNIT, false);
  return { human: "5.04", price, oneBase, value: v };
})();

/* ---------------- ask fill, step by step (buy 100 wNEAR from Priya) ---------------- */

export const askStep = (() => {
  const s = priyaAsk();
  const base = B("100");
  const pc = s.current_price;
  const pe = s.end_price;
  const span = pe - pc;
  const k = s.alpha + 1;
  const k1 = BigInt(k + 1);
  const x = divUp(base * FRAC, s.remaining);
  let xk = x;
  for (let i = 1; i < k; i++) xk = divUp(xk * x, FRAC);
  const num = base * (pc * FRAC * k1 + span * xk);
  const den = FRAC * k1 * UNIT * PRICE_SCALE;
  const quote = divUp(num, den);
  const step = divUp(span * xk, FRAC);
  const f = askFill(s, UNIT, base);
  if (f.quote !== quote || f.new_price !== pc + step) throw new Error("docs ask example diverged from curve-math");
  return { s, base, pc, pe, span, k, x, xk, num, den, quote, step, newPrice: f.new_price, avgPrice: avg(base, quote) };
})();

/** Buying successive sizes from Priya's untouched ask. */
export const askTable = ["1", "10", "50", "100", "200", "400"].map((h) => {
  const f = askFill(priyaAsk(), UNIT, B(h));
  return { size: h, cost: f.quote, avg: avg(f.base, f.quote), newPrice: f.new_price };
});

/* ---------------- bid side ---------------- */

export const bidStep = (() => {
  const s = priyaBid();
  const k = BigInt(s.alpha + 1);
  const span = s.current_price - s.end_price;
  const cap = bidCapacity(s, UNIT);
  const base = B("100");
  const f = bidFill(s, UNIT, base);
  const x = divUp(base * FRAC, cap);
  return { s, k, span, cap, base, x, quote: f.quote, newPrice: f.new_price, avgPrice: avg(base, f.quote) };
})();

export const bidTable = ["1", "50", "100", "200"].map((h) => {
  const f = bidFill(priyaBid(), UNIT, B(h));
  return { size: h, proceeds: f.quote, avg: avg(f.base, f.quote), newPrice: f.new_price };
});

/* ---------------- shapes (alpha 0..3) on the same 400 wNEAR / $5.04 → $5.20 range ---------------- */

export const shapes = [0, 1, 2, 3].map((alpha) => {
  const mk = () => newSide(B("400"), P("5.04"), P("5.20"), alpha);
  const at = (h: string) => askFill(mk(), UNIT, B(h));
  const half = at("200");
  const full = at("400");
  return {
    alpha,
    k: alpha + 1,
    p25: at("100").new_price,
    p50: half.new_price,
    p75: at("300").new_price,
    halfCost: half.quote,
    halfAvg: avg(half.base, half.quote),
    fullCost: full.quote,
    fullAvg: avg(full.base, full.quote),
  };
});

/* ---------------- routing: buy 200 wNEAR across Priya + Arjun ---------------- */

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

export const route = (() => {
  const size = B("200");
  // Priya's marginal price reaches Arjun's $5.06 when 5.04 + 0.16·x² = 5.06 → x = √(1/8).
  const priyaBase = isqrt((B("400") * B("400")) / 8n);
  const arjunBase = size - priyaBase;
  const p = askFill(priyaAsk(), UNIT, priyaBase);
  const a = askFill(arjunAsk(), UNIT, arjunBase);
  const total = p.quote + a.quote;
  const solo = askFill(priyaAsk(), UNIT, size);
  const best = P("5.04");
  const avgP = avg(size, total);
  const impactBps = Number(((avgP - best) * 10_000n) / best);
  const slippageBps = 50n;
  const amountInMax = (total * (10_000n + slippageBps) + 9_999n) / 10_000n;
  return {
    size, priyaBase, arjunBase, priya: p, arjun: a, total, solo, saving: solo.quote - total,
    avgP, best, impactBps, amountInMax, slippageBps,
  };
})();

/* ---------------- sell-side slippage ---------------- */

export const sellSlip = (() => {
  const f = bidFill(priyaBid(), UNIT, B("100"));
  const minOut = (f.quote * (10_000n - 50n)) / 10_000n;
  return { out: f.quote, minOut };
})();

/* ---------------- recycling: after the 100 wNEAR buy, Priya's bid grows ---------------- */

export const recycle = (() => {
  const bid = priyaBid();
  const before = bidCapacity(bid, UNIT);
  const proceeds = askStep.quote;
  const after = bidCapacity({ ...bid, remaining: bid.remaining + proceeds }, UNIT);
  // Then a taker sells 100 wNEAR back into the refilled bid.
  const refilled = { ...bid, remaining: bid.remaining + proceeds };
  const sell = bidFill(refilled, UNIT, B("100"));
  const spread = askStep.quote - sell.quote;
  return { proceeds, bidBefore: bid.remaining, bidAfter: bid.remaining + proceeds, capBefore: before, capAfter: after, sell, spread };
})();

/* ---------------- re-anchoring: 200 wNEAR in one fill vs two fills of 100 ---------------- */

export const reanchor = (() => {
  const one = askFill(priyaAsk(), UNIT, B("200"));
  const s0 = priyaAsk();
  const f1 = askFill(s0, UNIT, B("100"));
  const s1: Side = { ...s0, remaining: s0.remaining - f1.base, current_price: f1.new_price };
  const f2 = askFill(s1, UNIT, B("100"));
  return { one, f1, f2, split: f1.quote + f2.quote, s1 };
})();
