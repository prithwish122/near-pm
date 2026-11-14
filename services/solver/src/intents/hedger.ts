/**
 * Hedges Intents fills on the Ebbflow book.
 *
 * When the solver wins a quote, its `intents.near` balances move: it receives the user's token and
 * pays out the other one. The rebalancer compares the live balances with a baseline and closes the
 * gap by trading the same direction on the book, so Intents flow consumes maker curves:
 *
 *   withdraw (ft_withdraw) → swap on the book (ft_transfer_call) → deposit the results back.
 *
 * It works from balances, not quote hashes, so it needs no knowledge of how the relay settles.
 * The baseline is fixed at start. Whatever is not hedged this round (and the margin we earn) simply
 * stays in the delta and is considered again next round.
 */
import { buildQuote } from "../quote.js";
import { RouteError, routeBuyWithQuote, routeExactBase, type Route } from "../router.js";
import type { BookSource, Market } from "../types.js";
import { findMarket } from "../service.js";
import { CurveError } from "@ebbflow/curve-math";

export interface HedgeChain {
  /** Solver's balance of `token` held inside intents.near (mt_balance_of). */
  intentsBalance(token: string): Promise<bigint>;
  /** Solver's plain NEAR-account balance of `token` (ft_balance_of). */
  walletBalance(token: string): Promise<bigint>;
  /** intents.near ft_withdraw to the solver account. Resolves once final. */
  withdraw(token: string, amount: bigint): Promise<void>;
  /** ft_transfer_call(token → book) with the swap message. Resolves once final. */
  bookSwap(token: string, args: { receiver_id: string; amount: string; msg: string }): Promise<void>;
  /** ft_transfer_call(token → intents.near, msg = solver account). Resolves once final. */
  deposit(token: string, amount: bigint): Promise<void>;
}

export interface RebalancerOptions {
  source: BookSource;
  chain: HedgeChain;
  marketId: number;
  slippageBps?: number;
  /** Ignore base imbalances smaller than this (raw base units). */
  minBase?: bigint;
  log?: (msg: string, data?: unknown) => void;
}

export type HedgeResult =
  | { hedged: false; reason: string }
  | { hedged: true; side: Route["side"]; base: bigint; quote: bigint };

export class Rebalancer {
  private baseline?: { base: bigint; quote: bigint };
  private busy = false;
  private market?: Market;

  constructor(private readonly o: RebalancerOptions) {}

  private log(msg: string, data?: unknown) {
    (this.o.log ?? ((m, d) => console.log(`[hedge] ${m}`, d ?? "")))(msg, data);
  }

  /** Fixes the inventory we are happy to hold. Call once at start-up. */
  async init(): Promise<void> {
    this.market = await findMarket(this.o.source, this.o.marketId);
    this.baseline = { base: await this.o.chain.intentsBalance(this.market.base), quote: await this.o.chain.intentsBalance(this.market.quote) };
    this.log("baseline", { base: this.baseline.base.toString(), quote: this.baseline.quote.toString() });
  }

  async rebalance(): Promise<HedgeResult> {
    if (!this.baseline || !this.market) throw new Error("call init() first");
    if (this.busy) return { hedged: false, reason: "busy" };
    this.busy = true;
    try {
      return await this.run(this.market, this.baseline);
    } finally {
      this.busy = false;
    }
  }

  private async run(m: Market, baseline: { base: bigint; quote: bigint }): Promise<HedgeResult> {
    const c = this.o.chain;
    const db = (await c.intentsBalance(m.base)) - baseline.base;
    const dq = (await c.intentsBalance(m.quote)) - baseline.quote;
    if (db === 0n || (db < 0n ? -db : db) < (this.o.minBase ?? 0n)) return { hedged: false, reason: "in_balance" };

    const positions = await this.o.source.getPositions(m.market_id);
    let route: Route;
    try {
      if (db < 0n) {
        // Users bought base from us: buy it back with the quote they paid.
        if (dq <= 0n) return { hedged: false, reason: "no_quote_to_spend" };
        try {
          route = routeExactBase(positions, m, "buy_base", -db);
          if (route.quote_total > dq) route = routeBuyWithQuote(positions, m, dq);
        } catch (e) {
          if (!(e instanceof RouteError)) throw e;
          route = routeBuyWithQuote(positions, m, dq);
        }
      } else {
        route = routeExactBase(positions, m, "sell_base", db);
      }
    } catch (e) {
      if (e instanceof RouteError || e instanceof CurveError) return { hedged: false, reason: `route_${(e as RouteError).code?.toLowerCase?.() ?? "failed"}` };
      throw e;
    }

    const q = buildQuote(route, m, this.o.source.contractId, this.o.slippageBps ?? 50);
    const spendToken = route.side === "buy_base" ? m.quote : m.base;
    const amount = BigInt(q.tx.args.amount);
    const w0 = { base: await c.walletBalance(m.base), quote: await c.walletBalance(m.quote) };

    this.log(`hedging ${route.side}`, { base: route.base_total.toString(), quote: route.quote_total.toString(), legs: route.legs.length });
    await c.withdraw(spendToken, amount);
    await c.bookSwap(spendToken, q.tx.args);

    // Return everything the swap produced (and any refund) to the intents balance.
    for (const [token, before] of [
      [m.base, w0.base],
      [m.quote, w0.quote],
    ] as const) {
      const gained = (await c.walletBalance(token)) - before;
      if (gained > 0n) await c.deposit(token, gained);
    }
    return { hedged: true, side: route.side, base: route.base_total, quote: route.quote_total };
  }
}
