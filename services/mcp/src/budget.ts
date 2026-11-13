import { parseUnits } from "@ebbflow/curve-math";
import type { Market, QuoteResponse } from "@ebbflow/solver";
import type { Config } from "./config.js";

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

/**
 * Off-chain guard rails on top of the hard cap (the agent account's balance).
 * Tracks quote notional traded per UTC day, in memory.
 */
export class Budget {
  private day = "";
  private spent = new Map<number, bigint>();

  constructor(private readonly limits: Config["limits"]) {}

  private today(): string {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.spent.clear();
    }
    return d;
  }

  /** Quote notional of a trade: buy = max spend, sell = expected proceeds. */
  private notional(q: QuoteResponse): bigint {
    return BigInt(q.side === "buy_base" ? q.amount_in_max_raw : q.amount_out_raw);
  }

  private base(q: QuoteResponse): bigint {
    return BigInt(q.side === "buy_base" ? q.amount_out_raw : q.amount_in_raw);
  }

  /** Throws if the trade breaks a per-trade or daily limit. */
  check(q: QuoteResponse, m: Market): void {
    this.today();
    const maxBase = parseUnits(this.limits.maxTradeBase, m.base_decimals);
    const maxQuote = parseUnits(this.limits.maxTradeQuote, m.quote_decimals);
    const maxDaily = parseUnits(this.limits.maxDailyQuote, m.quote_decimals);
    if (this.base(q) > maxBase) {
      throw new BudgetError(`trade size exceeds MAX_TRADE_BASE (${this.limits.maxTradeBase})`);
    }
    const n = this.notional(q);
    if (n > maxQuote) {
      throw new BudgetError(`trade notional exceeds MAX_TRADE_QUOTE (${this.limits.maxTradeQuote})`);
    }
    if ((this.spent.get(m.market_id) ?? 0n) + n > maxDaily) {
      throw new BudgetError(`daily limit MAX_DAILY_QUOTE (${this.limits.maxDailyQuote}) would be exceeded`);
    }
  }

  record(q: QuoteResponse, m: Market): void {
    this.today();
    this.spent.set(m.market_id, (this.spent.get(m.market_id) ?? 0n) + this.notional(q));
  }

  remaining(m: Market): bigint {
    this.today();
    return parseUnits(this.limits.maxDailyQuote, m.quote_decimals) - (this.spent.get(m.market_id) ?? 0n);
  }
}
