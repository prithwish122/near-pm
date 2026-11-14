import type { SideJson } from "@ebbflow/curve-math";
import { SOLVER_URL } from "./config";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public availableRaw?: string) {
    super(message);
  }
}

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SOLVER_URL}${path}`, { ...init, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiError(0, "SOLVER_UNREACHABLE", `Cannot reach the solver at ${SOLVER_URL}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "ERROR", body.message ?? res.statusText, body.available_raw);
  return body as T;
}

export interface MarketRow {
  market_id: number;
  base: string;
  quote: string;
  base_decimals: number;
  quote_decimals: number;
  best_bid: string | null;
  best_ask: string | null;
  positions: number;
  depth_base_ask: string;
  depth_quote_bid: string;
}

export interface CurvePoint { base: number; price: number }
export interface CurvesResponse {
  market_id: number;
  best_ask: string | null;
  best_bid: string | null;
  positions: { position_id: string; owner_id: string; side: "ask" | "bid"; alpha: number; points: CurvePoint[] }[];
  depth: { asks: CurvePoint[]; bids: CurvePoint[] };
}

export interface PositionView {
  position_id: string;
  owner_id: string;
  market_id: number;
  ask: SideJson | null;
  bid: SideJson | null;
  bid_base_capacity: string;
  stats: { base_sold: string; quote_received: string; base_bought: string; quote_spent: string; fills: number };
  created_at_ms: number;
}

export interface Quote {
  market_id: number;
  side: "buy_base" | "sell_base";
  legs: { position_id: string; maker: string; base_amount: string; quote_amount: string; avg_price: string; new_price: string }[];
  amount_in: string;
  amount_in_raw: string;
  amount_in_max: string;
  amount_out: string;
  amount_out_raw: string;
  min_amount_out: string;
  avg_price: string;
  best_price: string;
  price_impact_bps: number;
  slippage_bps: number;
  tx: { receiver_id: string; method_name: "ft_transfer_call"; args: { receiver_id: string; amount: string; msg: string }; gas: string; deposit: string };
  warnings: string[];
}

export interface QuoteRequest {
  market_id: number;
  side: "buy_base" | "sell_base";
  base_amount?: string;
  quote_amount?: string;
  slippage_bps: number;
  taker?: string;
}

export const getMarkets = () => call<MarketRow[]>("/markets");
export const getCurves = (id: number, points = 40) => call<CurvesResponse>(`/markets/${id}/curves?points=${points}`);
export const postQuote = (req: QuoteRequest) => call<Quote>("/quote", { method: "POST", body: JSON.stringify(req) });
