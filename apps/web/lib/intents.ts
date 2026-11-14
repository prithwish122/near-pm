/** NEAR Intents (1Click) funding: pay from any chain, receive Ebbflow's tokens on NEAR mainnet. */
import { call } from "./api";
import { parseAmount } from "./format";

export interface IntentsToken { assetId: string; symbol: string; blockchain: string; decimals: number; price?: string | number }
export interface IntentsTokens { enabled: boolean; tokens: IntentsToken[] }

/** What a swap can deliver: the tokens the Ebbflow book trades on mainnet. */
export const DESTINATIONS = [
  { symbol: "wNEAR", assetId: "nep141:wrap.near" },
  { symbol: "USDC", assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1" },
] as const;

export const getIntentsTokens = () => call<IntentsTokens>("/intents/tokens");

export interface FundQuoteInput { origin: IntentsToken; destination: string; amount: string; recipient: string; refundTo: string; slippageBps: number; dry: boolean }

export const postFundQuote = (i: FundQuoteInput) => {
  const raw = parseAmount(i.amount, i.origin.decimals);
  if (raw === null || raw === 0n) throw new Error("Enter a valid amount");
  return call<FundQuoteResponse>("/intents/swap-quote", {
    method: "POST",
    body: JSON.stringify({ origin_asset: i.origin.assetId, destination_asset: i.destination, amount: raw.toString(), recipient: i.recipient, refund_to: i.refundTo, slippage_bps: i.slippageBps, dry: i.dry }),
  });
};

export const getFundStatus = (depositAddress: string) => call<{ status?: string }>(`/intents/status?deposit_address=${encodeURIComponent(depositAddress)}`);

export interface FundQuoteResponse {
  quote?: { amountInFormatted?: string; amountOutFormatted?: string; minAmountOut?: string; amountOutUsd?: string; timeEstimate?: number; depositAddress?: string; deadline?: string };
}

/** One-line summary of a 1Click quote for display. */
export function summarizeFundQuote(r: FundQuoteResponse, originSymbol: string, destSymbol: string): string | null {
  const q = r.quote;
  if (!q?.amountInFormatted || !q.amountOutFormatted) return null;
  const eta = q.timeEstimate ? ` in about ${Math.max(1, Math.round(q.timeEstimate / 60))} min` : "";
  return `Pay ${q.amountInFormatted} ${originSymbol}, receive about ${q.amountOutFormatted} ${destSymbol}${eta}.`;
}

/** Tokens matching a search box, with NEAR-native assets pushed to the end (they need no bridging). */
export function filterTokens(tokens: IntentsToken[], query: string, limit = 50): IntentsToken[] {
  const q = query.trim().toLowerCase();
  return tokens
    .filter((t) => !q || `${t.symbol} ${t.blockchain}`.toLowerCase().includes(q))
    .sort((a, b) => Number(a.blockchain === "near") - Number(b.blockchain === "near") || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}
