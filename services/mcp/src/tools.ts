/** Tool implementations, independent of the MCP transport so they can be unit tested. */
import { askFill, bidFill, CurveError, formatPrice, formatUnits, PRICE_SCALE, sideFromJson } from "@ebbflow/curve-math";
import {
  candidates,
  curves,
  findMarket,
  getQuote,
  QuoteRequest,
  routeRequest,
  summary,
  type BookSource,
  type Market,
  type OneClick,
  type QuoteResponse,
} from "@ebbflow/solver";
import { Budget, BudgetError } from "./budget.js";
import type { Config } from "./config.js";
import { ebbflowEvents, type AgentWallet } from "./wallet.js";

export interface Chain {
  view<T>(accountId: string, methodName: string, args?: unknown): Promise<T>;
  nearBalance(accountId: string): Promise<bigint>;
}

export interface Deps {
  source: BookSource;
  chain: Chain;
  wallet?: AgentWallet;
  budget: Budget;
  config: Pick<Config, "explorerTxUrl" | "limits">;
  /** NEAR Intents 1Click client; enables the cross-chain funding tools. */
  oneClick?: OneClick;
}

/** Trade parameters shared by quote / simulate / execute. */
export interface TradeArgs {
  market_id: number;
  side: "buy_base" | "sell_base";
  base_amount?: string;
  quote_amount?: string;
  slippage_bps?: number;
}

export class ToolError extends Error {}

const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR
const SWAP_GAS = 150_000_000_000_000n;
const CALL_GAS = 30_000_000_000_000n;

function quoteRequest(a: TradeArgs, taker?: string): QuoteRequest {
  const r = QuoteRequest.safeParse({
    market_id: a.market_id,
    side: a.side,
    base_amount: a.base_amount,
    quote_amount: a.quote_amount,
    slippage_bps: a.slippage_bps,
    taker,
  });
  if (!r.success) throw new ToolError(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

export class EbbflowTools {
  constructor(private readonly d: Deps) {}

  private get agentId(): string | undefined {
    return this.d.wallet?.accountId;
  }

  private get oneClick(): OneClick {
    if (!this.d.oneClick) throw new ToolError("NEAR Intents is not configured (set INTENTS_API_KEY; mainnet only)");
    return this.d.oneClick;
  }

  /** Assets that can be swapped into the book's tokens from other chains via NEAR Intents. */
  async intentsTokens(a: { query?: string; limit?: number }) {
    const q = a.query?.toLowerCase();
    const tokens = (await this.oneClick.getTokens()).filter((t) => !q || `${t.symbol} ${t.blockchain} ${t.assetId}`.toLowerCase().includes(q));
    return { count: tokens.length, tokens: tokens.slice(0, Math.min(100, a.limit ?? 25)) };
  }

  /** Dry quote for funding the agent's NEAR account from another chain. Sends nothing. */
  async intentsFundQuote(a: { origin_asset: string; destination_asset: string; amount: string; refund_to: string; slippage_bps?: number }) {
    const recipient = this.agentId;
    if (!recipient) throw new ToolError("no agent account configured to receive funds");
    return this.oneClick.quote({
      originAsset: a.origin_asset,
      destinationAsset: a.destination_asset,
      amount: a.amount,
      recipient,
      refundTo: a.refund_to,
      slippageBps: a.slippage_bps,
      dry: true,
    });
  }

  async listMarkets() {
    const markets = await this.d.source.getMarkets();
    return {
      contract: this.d.source.contractId,
      network: this.d.source.network,
      markets: await Promise.all(
        markets.map(async (m) => ({ ...m, ...summary(await this.d.source.getPositions(m.market_id), m) })),
      ),
    };
  }

  async getLiquidity(a: { market_id: number; levels?: number }) {
    const m = await findMarket(this.d.source, a.market_id);
    const positions = await this.d.source.getPositions(m.market_id);
    const c = curves(positions, m, Math.min(50, Math.max(2, a.levels ?? 10)));
    const makers = (side: "buy_base" | "sell_base") =>
      candidates(positions, m, side).map((x) => ({
        position_id: x.position_id,
        maker: x.owner_id,
        current_price: formatPrice(x.side.current_price, m.quote_decimals),
        end_price: formatPrice(x.side.end_price, m.quote_decimals),
        alpha: x.side.alpha,
        kind: x.side.current_price === x.side.end_price ? "limit" : "curve",
        base_capacity: formatUnits(x.capacity, m.base_decimals, 6),
      }));
    const round = (pts: { base: number; price: number }[]) =>
      pts.map((p) => ({ price: +p.price.toFixed(6), cumulative_base: +p.base.toFixed(6) }));
    return {
      market_id: m.market_id,
      best_ask: c.best_ask,
      best_bid: c.best_bid,
      asks: makers("buy_base"),
      bids: makers("sell_base"),
      depth: { asks: round(c.depth.asks), bids: round(c.depth.bids) },
    };
  }

  async getQuote(a: TradeArgs): Promise<QuoteResponse> {
    return getQuote(this.d.source, quoteRequest(a, this.agentId));
  }

  async simulateRoute(a: TradeArgs) {
    const q = await this.getQuote(a);
    const sim = await this.d.source.simulateSwap(q.msg, q.tx.args.amount);
    return {
      ok: sim.ok,
      error: sim.error,
      attached: q.tx.args.amount,
      amount_in_used_raw: sim.amount_in_used,
      amount_out_raw: sim.amount_out,
      refund_raw: sim.refund,
      quote: { amount_in: q.amount_in, amount_out: q.amount_out, avg_price: q.avg_price, legs: q.legs.length },
    };
  }

  /** Ebbflow's multi-maker route vs filling the whole size from the single best position. */
  async compareLiquidity(a: { market_id: number; side: "buy_base" | "sell_base"; base_amount: string }) {
    const { market: m, route } = await routeRequest(this.d.source, quoteRequest({ ...a }, this.agentId));
    const unit = 10n ** BigInt(m.base_decimals);
    const size = route.base_total;
    const buy = a.side === "buy_base";
    const avg = (base: bigint, quote: bigint) => (quote * unit * PRICE_SCALE) / base;

    let bestSingle: { position_id: string; maker: string; quote: bigint } | undefined;
    for (const p of await this.d.source.getPositions(m.market_id)) {
      const raw = buy ? p.ask : p.bid;
      if (!raw || p.owner_id === this.agentId) continue;
      try {
        const s = sideFromJson(raw);
        const q = (buy ? askFill(s, unit, size) : bidFill(s, unit, size)).quote;
        if (!bestSingle || (buy ? q < bestSingle.quote : q > bestSingle.quote)) {
          bestSingle = { position_id: p.position_id, maker: p.owner_id, quote: q };
        }
      } catch (e) {
        if (!(e instanceof CurveError)) throw e;
      }
    }
    const ebbAvg = avg(size, route.quote_total);
    const bps = (better: bigint, worse: bigint) => Number(((buy ? worse - better : better - worse) * 10_000n) / worse);
    return {
      size: formatUnits(size, m.base_decimals, 6),
      ebbflow: {
        legs: route.legs.length,
        quote_total: formatUnits(route.quote_total, m.quote_decimals),
        avg_price: formatPrice(ebbAvg, m.quote_decimals),
      },
      best_single_maker: bestSingle
        ? {
            position_id: bestSingle.position_id,
            maker: bestSingle.maker,
            quote_total: formatUnits(bestSingle.quote, m.quote_decimals),
            avg_price: formatPrice(avg(size, bestSingle.quote), m.quote_decimals),
            ebbflow_improvement_bps: bps(route.quote_total, bestSingle.quote),
          }
        : { note: "no single position can fill this size; only a multi-maker route can" },
      top_of_book_price: formatPrice(route.best_price, m.quote_decimals),
      slippage_vs_top_of_book_bps: Number(((buy ? ebbAvg - route.best_price : route.best_price - ebbAvg) * 10_000n) / route.best_price),
    };
  }

  async executeSwap(a: TradeArgs & { dry_run?: boolean }) {
    const wallet = this.d.wallet;
    if (!wallet) throw new ToolError("no agent wallet configured: set AGENT_ACCOUNT_ID (and AGENT_PRIVATE_KEY)");
    const m = await findMarket(this.d.source, a.market_id);
    const q = await this.getQuote(a);
    this.d.budget.check(q, m);

    const sim = await this.d.source.simulateSwap(q.msg, q.tx.args.amount);
    if (!sim.ok) throw new ToolError(`simulation failed: ${sim.error}; not sending`);
    if (a.dry_run) {
      return { status: "dry_run", would_send: q.tx, amount_in: q.amount_in, amount_out: q.amount_out, simulation: sim };
    }

    const outputToken = a.side === "buy_base" ? m.base : m.quote;
    if (q.warnings.includes("recipient_not_registered_with_output_token")) {
      const reg = await wallet.call(outputToken, "storage_deposit", { account_id: wallet.accountId }, STORAGE_DEPOSIT, CALL_GAS);
      if (!reg.success) throw new ToolError(`could not register with ${outputToken}: ${reg.failure}`);
    }

    const tx = await wallet.call(q.tx.receiver_id, "ft_transfer_call", q.tx.args, 1n, SWAP_GAS);
    const events = ebbflowEvents(tx.logs);
    const swap = events.find((e) => e.event === "swap")?.data;
    const rejected = events.find((e) => e.event === "swap_rejected")?.data;
    const credited = events.some((e) => e.event === "payout_credited");
    if (swap) this.d.budget.record(q, m);

    const inDec = a.side === "buy_base" ? m.quote_decimals : m.base_decimals;
    const outDec = a.side === "buy_base" ? m.base_decimals : m.quote_decimals;
    const fmt = (v: unknown, dec: number) => (typeof v === "string" ? formatUnits(BigInt(v), dec, 6) : undefined);
    return {
      status: swap ? "filled" : rejected ? "refunded" : tx.success ? "unknown" : "failed",
      tx_hash: tx.hash,
      explorer_url: tx.hash ? `${this.d.config.explorerTxUrl}${tx.hash}` : undefined,
      amount_in: fmt(swap?.amount_in, inDec),
      amount_out: fmt(swap?.amount_out, outDec),
      refund: fmt(swap?.refund ?? rejected?.amount_refunded, inDec),
      reject_reason: rejected?.reason,
      output_credited_in_book: credited || undefined,
      legs: q.legs.map((l) => ({ maker: l.maker, base_amount: l.base_amount, avg_price: l.avg_price })),
      failure: tx.failure,
    };
  }

  async getAgentBalance() {
    const wallet = this.d.wallet;
    if (!wallet) throw new ToolError("no agent wallet configured: set AGENT_ACCOUNT_ID (and AGENT_PRIVATE_KEY)");
    const id = wallet.accountId;
    const markets = await this.d.source.getMarkets();
    const tokens = new Map<string, number>();
    for (const m of markets) {
      tokens.set(m.base, m.base_decimals);
      tokens.set(m.quote, m.quote_decimals);
    }
    const near = await this.d.chain.nearBalance(id);
    const rows = await Promise.all(
      [...tokens].map(async ([token, dec]) => {
        const wallet = await this.d.chain.view<string>(token, "ft_balance_of", { account_id: id }).catch(() => "0");
        const book = await this.d.chain.view<string>(this.d.source.contractId, "get_balance", { account_id: id, token_id: token });
        return { token, wallet: formatUnits(BigInt(wallet), dec, 6), in_book: formatUnits(BigInt(book), dec, 6) };
      }),
    );
    return {
      account_id: id,
      near: formatUnits(near, 24, 4),
      tokens: rows,
      limits: this.d.config.limits,
      daily_quote_remaining: markets.map((m: Market) => ({
        market_id: m.market_id,
        remaining: formatUnits(this.d.budget.remaining(m), m.quote_decimals),
      })),
    };
  }
}

export { BudgetError };
