import { formatPrice, formatUnits, PRICE_SCALE } from "@ebbflow/curve-math";
import type { Route } from "./router.js";
import type { Market, SwapMsg } from "./types.js";

export const SWAP_GAS = "150000000000000"; // 150 Tgas
export const MAX_SLIPPAGE_BPS = 500;

export interface QuoteResponse {
  market_id: number;
  side: Route["side"];
  legs: {
    position_id: string;
    maker: string;
    base_amount: string;
    base_amount_raw: string;
    quote_amount: string;
    quote_amount_raw: string;
    avg_price: string;
    new_price: string;
  }[];
  /** What the taker sends (buy: quote spent; sell: base sold). */
  amount_in: string;
  amount_in_raw: string;
  /** Buy: amount attached including slippage headroom (unused part is refunded). Sell: = amount_in. */
  amount_in_max: string;
  amount_in_max_raw: string;
  amount_out: string;
  amount_out_raw: string;
  /** Lowest output the contract will accept. */
  min_amount_out: string;
  min_amount_out_raw: string;
  avg_price: string;
  best_price: string;
  price_impact_bps: number;
  slippage_bps: number;
  msg: SwapMsg;
  tx: {
    receiver_id: string;
    method_name: "ft_transfer_call";
    args: { receiver_id: string; amount: string; msg: string };
    gas: string;
    deposit: "1";
  };
  warnings: string[];
}

/** Scaled price paid/received per whole base token. */
export function avgPrice(base: bigint, quote: bigint, baseUnit: bigint): bigint {
  return base === 0n ? 0n : (quote * baseUnit * PRICE_SCALE) / base;
}

export function buildQuote(
  route: Route,
  market: Market,
  bookId: string,
  slippageBps: number,
  recipient?: string,
): QuoteResponse {
  const bu = 10n ** BigInt(market.base_decimals);
  const bd = market.base_decimals;
  const qd = market.quote_decimals;
  const bps = BigInt(slippageBps);
  const buy = route.side === "buy_base";

  let amountIn: bigint, amountInMax: bigint, amountOut: bigint, minOut: bigint;
  if (buy) {
    amountIn = route.quote_total;
    amountInMax = (amountIn * (10_000n + bps) + 9_999n) / 10_000n;
    amountOut = route.base_total;
    // Each leg's base is exact, so the output never varies; the attached amount is the limit.
    minOut = amountOut;
  } else {
    amountIn = route.base_total;
    amountInMax = amountIn;
    amountOut = route.quote_total;
    minOut = (amountOut * (10_000n - bps)) / 10_000n;
  }

  const avg = avgPrice(route.base_total, route.quote_total, bu);
  const best = route.best_price;
  const diff = buy ? avg - best : best - avg;
  const impact = best === 0n ? 0 : Number((diff * 10_000n) / best);

  const msg: SwapMsg = {
    market_id: market.market_id,
    side: route.side,
    legs: route.legs.map((l) => ({ position_id: l.position_id, base_amount: l.base.toString() })),
    min_amount_out: minOut.toString(),
    ...(recipient ? { recipient } : {}),
  };
  const inDec = buy ? qd : bd;
  const outDec = buy ? bd : qd;

  return {
    market_id: market.market_id,
    side: route.side,
    legs: route.legs.map((l) => ({
      position_id: l.position_id,
      maker: l.owner_id,
      base_amount: formatUnits(l.base, bd, 6),
      base_amount_raw: l.base.toString(),
      quote_amount: formatUnits(l.quote, qd),
      quote_amount_raw: l.quote.toString(),
      avg_price: formatPrice(avgPrice(l.base, l.quote, bu), qd),
      new_price: formatPrice(l.new_price, qd),
    })),
    amount_in: formatUnits(amountIn, inDec, 6),
    amount_in_raw: amountIn.toString(),
    amount_in_max: formatUnits(amountInMax, inDec, 6),
    amount_in_max_raw: amountInMax.toString(),
    amount_out: formatUnits(amountOut, outDec, 6),
    amount_out_raw: amountOut.toString(),
    min_amount_out: formatUnits(minOut, outDec, 6),
    min_amount_out_raw: minOut.toString(),
    avg_price: formatPrice(avg, qd),
    best_price: formatPrice(best, qd),
    price_impact_bps: Math.max(0, impact),
    slippage_bps: slippageBps,
    msg,
    tx: {
      receiver_id: buy ? market.quote : market.base,
      method_name: "ft_transfer_call",
      args: {
        receiver_id: bookId,
        amount: amountInMax.toString(),
        msg: JSON.stringify({ action: "swap", ...msg }),
      },
      gas: SWAP_GAS,
      deposit: "1",
    },
    warnings: [],
  };
}
