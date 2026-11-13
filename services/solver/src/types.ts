import type { SideJson } from "@ebbflow/curve-math";

export type SwapSide = "buy_base" | "sell_base";

/** `get_markets` element, with its index as `market_id`. */
export interface Market {
  market_id: number;
  base: string;
  quote: string;
  base_decimals: number;
  quote_decimals: number;
}

/** `get_positions` element. */
export interface PositionView {
  position_id: string;
  owner_id: string;
  market_id: number;
  ask: SideJson | null;
  bid: SideJson | null;
  bid_base_capacity: string;
  stats: {
    base_sold: string;
    quote_received: string;
    base_bought: string;
    quote_spent: string;
    fills: number;
  };
  created_at_ms: number;
}

/** The contract's swap message (without the `action` tag). */
export interface SwapMsg {
  market_id: number;
  side: SwapSide;
  legs: { position_id: string; base_amount: string }[];
  min_amount_out: string;
  recipient?: string | null;
}

/** `simulate_swap` result. */
export interface SimulateView {
  ok: boolean;
  error: string | null;
  legs: { position_id: string; base_amount: string; quote_amount: string; new_price: string }[];
  amount_in_used: string;
  amount_out: string;
  refund: string;
}

/** Everything the solver needs from the chain. Swappable for tests. */
export interface BookSource {
  contractId: string;
  network: string;
  getMarkets(): Promise<Market[]>;
  getPositions(marketId: number): Promise<PositionView[]>;
  simulateSwap(msg: SwapMsg, amount: string): Promise<SimulateView>;
  /** Whether `accountId` holds a NEP-145 registration on `tokenId`. */
  isRegistered(tokenId: string, accountId: string): Promise<boolean>;
  blockHeight(): Promise<number>;
}
