/** Client-side curve previews using the shared exact-integer maths (same code the solver uses). */
import { PRICE_SCALE, askCapacity, askFill, bidCapacity, bidFill, formatPrice, formatUnits, newSide, parsePrice, type Side } from "@ebbflow/curve-math";
import { parseAmount } from "./format";
import type { MarketConfig } from "./config";

export interface SideForm { on: boolean; amount: string; start: string; end: string; limit: boolean; alpha: number }

export interface ParsedSide {
  side: Side | null;
  errors: { amount?: string; start?: string; end?: string };
}

const price = (s: string, qd: number): bigint | null => {
  if (!/^\d+(\.\d+)?$/.test(s.trim())) return null;
  try { return parsePrice(s.trim(), qd); } catch { return null; }
};

/** Mirrors contract validation (PRD §7.7) with inline messages. */
export function parseSide(kind: "ask" | "bid", f: SideForm, m: MarketConfig): ParsedSide {
  const errors: ParsedSide["errors"] = {};
  const amount = parseAmount(f.amount, kind === "ask" ? m.base_decimals : m.quote_decimals);
  if (amount === null) errors.amount = f.amount.trim() ? "Enter a valid amount" : "Required";
  else if (amount === 0n) errors.amount = "Must be greater than 0";
  const start = price(f.start, m.quote_decimals);
  const end = f.limit ? start : price(f.end, m.quote_decimals);
  if (start === null) errors.start = "Enter a valid price";
  else if (start === 0n) errors.start = "Must be greater than 0";
  if (!f.limit) {
    if (end === null) errors.end = "Enter a valid price";
    else if (end === 0n) errors.end = "Must be greater than 0";
    else if (start !== null && start > 0n) {
      if (kind === "ask" && end < start) errors.end = "End price must be ≥ start for an ask";
      if (kind === "bid" && end > start) errors.end = "End price must be ≤ start for a bid";
    }
  }
  if (Object.keys(errors).length || amount === null || start === null || end === null) return { side: null, errors };
  return { side: newSide(amount, start, end, f.alpha), errors };
}

export interface Slice { pct: number; marginal: string; avg: string }

/** Price-vs-cumulative-size points and a 25/50/75/100% slice table for one side. */
export function previewSide(kind: "ask" | "bid", s: Side, m: MarketConfig, steps = 40): { pts: [number, number][]; slices: Slice[]; capacity: bigint } {
  const unit = 10n ** BigInt(m.base_decimals);
  const cap = kind === "ask" ? askCapacity(s) : bidCapacity(s, unit);
  const fill = (b: bigint) => (kind === "ask" ? askFill(s, unit, b) : bidFill(s, unit, b));
  const px = (p: bigint) => Number(formatPrice(p, m.quote_decimals, 12));
  const pts: [number, number][] = [[px(s.current_price), 0]];
  for (let i = 1; i <= steps; i++) {
    const b = (cap * BigInt(i)) / BigInt(steps);
    if (b === 0n) continue;
    try { pts.push([px(fill(b).new_price), Number(formatUnits(b, m.base_decimals, 12))]); } catch { /* rounding at the boundary */ }
  }
  const slices: Slice[] = [];
  for (const pct of [25, 50, 75, 100]) {
    const b = (cap * BigInt(pct)) / 100n;
    if (b === 0n) continue;
    try {
      const f = fill(b);
      slices.push({ pct, marginal: formatPrice(f.new_price, m.quote_decimals, 4), avg: formatPrice((f.quote * unit * PRICE_SCALE) / b, m.quote_decimals, 4) });
    } catch { /* skip */ }
  }
  return { pts, slices, capacity: cap };
}
