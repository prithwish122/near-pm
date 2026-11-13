/** Quote logic shared by the HTTP API and the MCP server. */
import { parseUnits } from "@ebbflow/curve-math";
import { z } from "zod";
import { buildQuote, MAX_SLIPPAGE_BPS, type QuoteResponse } from "./quote.js";
import { routeBuyWithQuote, routeExactBase, type Route } from "./router.js";
import type { BookSource, Market } from "./types.js";

export const amount = z.string().regex(/^\d+(\.\d+)?$/, "decimal string");
export const rawAmount = z.string().regex(/^\d+$/, "integer string");
export const account = z.string().min(2).max(64);

export const QuoteRequest = z
  .object({
    market_id: z.number().int().nonnegative(),
    side: z.enum(["buy_base", "sell_base"]),
    /** Exact base size, human units ("200"). */
    base_amount: amount.optional(),
    base_amount_raw: rawAmount.optional(),
    /** Buy only: spend at most this much quote. */
    quote_amount: amount.optional(),
    quote_amount_raw: rawAmount.optional(),
    slippage_bps: z.number().int().min(0).max(MAX_SLIPPAGE_BPS).default(50),
    taker: account.optional(),
    recipient: account.optional(),
    /** Skip the taker's own positions. */
    exclude_own: z.boolean().default(true),
  })
  .refine(
    (q) => [q.base_amount, q.base_amount_raw, q.quote_amount, q.quote_amount_raw].filter((v) => v !== undefined).length === 1,
    "provide exactly one of base_amount, base_amount_raw, quote_amount, quote_amount_raw",
  )
  .refine(
    (q) => q.side === "buy_base" || (q.quote_amount === undefined && q.quote_amount_raw === undefined),
    "quote_amount is only supported for buy_base",
  );
export type QuoteRequest = z.infer<typeof QuoteRequest>;

export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 422 | 502,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function findMarket(source: BookSource, id: number): Promise<Market> {
  const m = (await source.getMarkets()).find((x) => x.market_id === id);
  if (!m) throw new HttpError(404, "MARKET_NOT_FOUND", `market ${id} not found`);
  return m;
}

/** Routes a validated quote request against the live book. */
export async function routeRequest(source: BookSource, q: QuoteRequest): Promise<{ market: Market; route: Route }> {
  const market = await findMarket(source, q.market_id);
  const positions = await source.getPositions(market.market_id);
  const opts = { excludeOwner: q.exclude_own ? q.taker : undefined };
  try {
    if (q.quote_amount !== undefined || q.quote_amount_raw !== undefined) {
      const budget = q.quote_amount_raw !== undefined ? BigInt(q.quote_amount_raw) : parseUnits(q.quote_amount!, market.quote_decimals);
      return { market, route: routeBuyWithQuote(positions, market, budget, opts) };
    }
    const size = q.base_amount_raw !== undefined ? BigInt(q.base_amount_raw) : parseUnits(q.base_amount!, market.base_decimals);
    return { market, route: routeExactBase(positions, market, q.side, size, opts) };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("too many decimals")) {
      throw new HttpError(400, "INVALID_REQUEST", e.message);
    }
    throw e;
  }
}

/** Full quote: route, signable tx args and registration warnings. */
export async function getQuote(source: BookSource, q: QuoteRequest): Promise<QuoteResponse> {
  const { market, route } = await routeRequest(source, q);
  const quote = buildQuote(route, market, source.contractId, q.slippage_bps, q.recipient);
  const receiver = q.recipient ?? q.taker;
  if (receiver) {
    const outputToken = q.side === "buy_base" ? market.base : market.quote;
    try {
      if (!(await source.isRegistered(outputToken, receiver))) {
        quote.warnings.push("recipient_not_registered_with_output_token");
      }
    } catch {
      quote.warnings.push("registration_check_failed");
    }
  }
  return quote;
}
