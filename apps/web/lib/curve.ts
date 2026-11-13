// Floating-point demo port of the Ebbflow curve maths (PRD §7.3, §7.8).
// The real contract uses exact U256 integer maths; this is for the landing-page quote demo only.
export type Leg = { maker: string; base: number; quote: number; avg: number };

const K = 2; // alpha = 1 -> k = 1 + alpha

// Demo book (PRD §7.8): Priya's curve (ask + bid) and Arjun's limit order.
const PRIYA_ASK = { R: 400, ps: 5.04, pe: 5.2 };
const ARJUN_ASK = { R: 100, ps: 5.06, pe: 5.06 };
const PRIYA_BID = { R: 2000, pc: 4.96, pe: 4.8 };

export const BEST_ASK = 5.04;
export const BEST_BID = 4.96;
export const BID_CAPACITY = PRIYA_BID.R / (PRIYA_BID.pc - (PRIYA_BID.pc - PRIYA_BID.pe) / (K + 1));
export const ASK_CAPACITY = PRIYA_ASK.R + ARJUN_ASK.R;

const askCost = (d: number, s: { R: number; ps: number; pe: number }) => {
  const x = d / s.R;
  return d * (s.ps + ((s.pe - s.ps) * x ** K) / (K + 1));
};
const bidOut = (d: number) => {
  const x = d / BID_CAPACITY;
  return d * (PRIYA_BID.pc - ((PRIYA_BID.pc - PRIYA_BID.pe) * x ** K) / (K + 1));
};
const leg = (maker: string, base: number, quote: number): Leg => ({ maker, base, quote, avg: quote / base });

/** Route `base` wNEAR for a buy (taker pays tUSDC) or a sell (taker receives tUSDC). Null if over capacity. */
export function route(side: "buy" | "sell", base: number): Leg[] | null {
  if (!(base > 0)) return [];
  if (side === "sell") return base > BID_CAPACITY ? null : [leg("Priya", base, bidOut(base))];
  if (base > ASK_CAPACITY) return null;
  // Water-filling: equalise marginal prices. Priya's marginal reaches Arjun's $5.06 after sPA base.
  const sPA = PRIYA_ASK.R * ((ARJUN_ASK.ps - PRIYA_ASK.ps) / (PRIYA_ASK.pe - PRIYA_ASK.ps)) ** (1 / K);
  const parts: [string, number, typeof PRIYA_ASK][] =
    base <= sPA ? [["Priya", base, PRIYA_ASK]]
    : base <= sPA + ARJUN_ASK.R ? [["Priya", sPA, PRIYA_ASK], ["Arjun", base - sPA, ARJUN_ASK]]
    : [["Priya", base - ARJUN_ASK.R, PRIYA_ASK], ["Arjun", ARJUN_ASK.R, ARJUN_ASK]];
  return parts.filter(([, b]) => b > 1e-9).map(([m, b, s]) => leg(m, b, askCost(b, s)));
}

export const totals = (legs: Leg[]) => {
  const base = legs.reduce((a, l) => a + l.base, 0);
  const quote = legs.reduce((a, l) => a + l.quote, 0);
  return { base, quote, avg: base ? quote / base : 0 };
};

/** Inverse: base size whose total quote equals `quote` (exact-in). Null if the book cannot absorb it. */
export function baseForQuote(side: "buy" | "sell", quote: number): number | null {
  if (!(quote > 0)) return 0;
  const cap = side === "buy" ? ASK_CAPACITY : BID_CAPACITY;
  if (totals(route(side, cap)!).quote < quote) return null;
  let lo = 0, hi = cap;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    totals(route(side, mid)!).quote < quote ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}
