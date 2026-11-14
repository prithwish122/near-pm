import { formatUnits, parseUnits } from "@ebbflow/curve-math";

/** Human string for an atomic amount, trimmed to `max` fractional digits. */
export function fmtUnits(v: bigint | string, decimals: number, max = 4): string {
  const s = formatUnits(BigInt(v), decimals, max);
  const [i, f] = s.split(".");
  const int = i!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${int}.${f}` : int;
}

/** Parses user input into atomic units; null when empty, invalid or over-precise. */
export function parseAmount(input: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(input.trim())) return null;
  try {
    return parseUnits(input.trim(), decimals);
  } catch {
    return null;
  }
}

/** Why `input` can't be used as an amount, or null when it is empty or valid. */
export function amountProblem(input: string, decimals: number): string | null {
  const v = input.trim();
  if (!v) return null;
  if (!/^\d+(\.\d+)?$/.test(v)) return "Enter a valid number.";
  if ((v.split(".")[1]?.length ?? 0) > decimals) return `Too many decimals (max ${decimals}).`;
  return /^0+(\.0*)?$/.test(v) ? "Amount must be greater than 0." : null;
}

/** Keeps the start and the distinguishing tail, e.g. `ebbflo…-priya.testnet`. */
export const shortAccount = (id: string, max = 22) => (id.length <= max ? id : `${id.slice(0, 6)}…${id.slice(-14)}`);

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const YOCTO = 10n ** 24n;
export const fmtNear = (yocto: bigint, max = 3) => fmtUnits(yocto, 24, max);

/** Which token a fill's `recycled_amount` is in: the taker's input token (buy: quote, sell: base), whatever side it recycled to. */
export const recycledIsBase = (side: "buy_base" | "sell_base") => side === "sell_base";
