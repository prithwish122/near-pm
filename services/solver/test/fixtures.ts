import { newSide, parsePrice, parseUnits, sideToJson, type Side } from "@ebbflow/curve-math";
import type { BookSource, Market, PositionView, SimulateView, SwapMsg } from "../src/types.js";

export const MARKET: Market = { market_id: 0, base: "wrap.testnet", quote: "usdc.testnet", base_decimals: 24, quote_decimals: 6 };
export const B = (h: string) => parseUnits(h, 24);
export const Q = (h: string) => parseUnits(h, 6);
export const P = (h: string) => parsePrice(h, 6);

let nextId = 0;
export function position(owner: string, ask?: Side, bid?: Side): PositionView {
  return {
    position_id: String(nextId++),
    owner_id: owner,
    market_id: 0,
    ask: ask ? sideToJson(ask) : null,
    bid: bid ? sideToJson(bid) : null,
    bid_base_capacity: "0",
    stats: { base_sold: "0", quote_received: "0", base_bought: "0", quote_spent: "0", fills: 0 },
    created_at_ms: 0,
  };
}

/** The PRD §7.8 book: Priya's two-sided curve and Arjun's limit order. */
export function prdBook(): PositionView[] {
  return [
    position("priya.testnet", newSide(B("400"), P("5.04"), P("5.20"), 1), newSide(Q("2000"), P("4.96"), P("4.80"), 1)),
    position("arjun.testnet", newSide(B("100"), P("5.06"), P("5.06"), 0)),
  ];
}

export class MemorySource implements BookSource {
  contractId = "book.testnet";
  network = "sandbox";
  registered = new Set<string>();
  constructor(public positions: PositionView[]) {}
  async getMarkets() {
    return [MARKET];
  }
  async getPositions() {
    return this.positions;
  }
  async simulateSwap(_msg: SwapMsg, amount: string): Promise<SimulateView> {
    return { ok: true, error: null, legs: [], amount_in_used: amount, amount_out: "0", refund: "0" };
  }
  async isRegistered(token: string, account: string) {
    return this.registered.has(`${token}:${account}`);
  }
  async blockHeight() {
    return 1;
  }
}
