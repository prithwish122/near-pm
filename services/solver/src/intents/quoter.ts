/**
 * Prices NEAR Intents swap requests against the Ebbflow book.
 *
 * The solver quotes the Ebbflow route price plus a margin. Settlement is hedged by filling the same
 * route on the book, so Intents flow ends up consuming maker curves.
 */
import { RouteError, routeBuyWithQuote, routeExactBase, type Route } from "../router.js";
import type { BookSource, Market } from "../types.js";
import { CurveError } from "@ebbflow/curve-math";

export interface IntentsQuoteRequest {
  quote_id: string;
  defuse_asset_identifier_in: string;
  defuse_asset_identifier_out: string;
  exact_amount_in?: string;
  exact_amount_out?: string;
  min_deadline_ms?: number;
}

export interface QuoterConfig {
  /** Spread kept by the solver, in bps of the quoted amount. */
  marginBps: number;
  /** Largest trade the solver will quote, in raw quote-token units (e.g. 5_000_000 = 5 USDC). */
  maxQuoteRaw: bigint;
  /** Maps a token contract to its Intents asset id. Default `nep141:<contract>`. */
  assetId?: (token: string) => string;
}

export type Decision =
  | { ok: true; market: Market; route: Route; amountIn: bigint; amountOut: bigint; side: Route["side"] }
  | { ok: false; reason: string };

const skip = (reason: string): Decision => ({ ok: false, reason });
const asId = (c: QuoterConfig, t: string) => (c.assetId ? c.assetId(t) : `nep141:${t}`);

/** Asset ids to subscribe to on the bus: every token of every market. */
export async function subscribedAssets(source: BookSource, cfg: QuoterConfig): Promise<string[]> {
  const ids = new Set<string>();
  for (const m of await source.getMarkets()) {
    ids.add(asId(cfg, m.base));
    ids.add(asId(cfg, m.quote));
  }
  return [...ids];
}

function parseRaw(v: string | undefined): bigint | undefined {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new Error("amount must be an integer string");
  return BigInt(v);
}

export async function decide(source: BookSource, cfg: QuoterConfig, req: IntentsQuoteRequest): Promise<Decision> {
  let exactIn: bigint | undefined, exactOut: bigint | undefined;
  try {
    exactIn = parseRaw(req.exact_amount_in);
    exactOut = parseRaw(req.exact_amount_out);
  } catch {
    return skip("bad_amount");
  }
  if ((exactIn === undefined) === (exactOut === undefined)) return skip("need_exactly_one_exact_amount");
  if ((exactIn ?? exactOut)! <= 0n) return skip("bad_amount");

  const markets = await source.getMarkets();
  const inId = req.defuse_asset_identifier_in;
  const outId = req.defuse_asset_identifier_out;
  // The user's input is the solver's receipt: user pays quote → user buys base, and vice versa.
  const market = markets.find(
    (m) =>
      (asId(cfg, m.quote) === inId && asId(cfg, m.base) === outId) ||
      (asId(cfg, m.base) === inId && asId(cfg, m.quote) === outId),
  );
  if (!market) return skip("unsupported_pair");
  const userBuysBase = asId(cfg, market.quote) === inId;
  const positions = await source.getPositions(market.market_id);
  const margin = BigInt(cfg.marginBps);
  if (margin < 0n || margin >= 10_000n) return skip("bad_margin");

  try {
    let route: Route, amountIn: bigint, amountOut: bigint;
    if (userBuysBase) {
      if (exactIn !== undefined) {
        const budget = (exactIn * (10_000n - margin)) / 10_000n;
        route = routeBuyWithQuote(positions, market, budget);
        amountIn = exactIn;
        amountOut = route.base_total;
      } else {
        route = routeExactBase(positions, market, "buy_base", exactOut!);
        amountIn = (route.quote_total * (10_000n + margin) + 9_999n) / 10_000n;
        amountOut = exactOut!;
      }
    } else {
      // User sells base. Exact-out quote isn't supported by the router, so decline it.
      if (exactIn === undefined) return skip("exact_out_sell_unsupported");
      route = routeExactBase(positions, market, "sell_base", exactIn);
      amountIn = exactIn;
      amountOut = (route.quote_total * (10_000n - margin)) / 10_000n;
    }
    if (amountIn <= 0n || amountOut <= 0n) return skip("zero_amount");
    if (route.quote_total > cfg.maxQuoteRaw) return skip("above_size_cap");
    return { ok: true, market, route, amountIn, amountOut, side: route.side };
  } catch (e) {
    if (e instanceof RouteError) return skip(e.code.toLowerCase());
    if (e instanceof CurveError) return skip("route_failed");
    throw e;
  }
}
