import deployment from "../../../deployments/testnet.json";

export const NETWORK = "testnet" as const;
export const BOOK: string = deployment.book;
export const OWNER: string = deployment.owner;
export const EXPLORER = "https://testnet.nearblocks.io";

export const RPC_URLS = (process.env.NEXT_PUBLIC_NEAR_RPC_URLS ?? "https://test.rpc.fastnear.com,https://rpc.testnet.near.org")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const SOLVER_URL = (process.env.NEXT_PUBLIC_SOLVER_URL ?? "http://localhost:8787").replace(/\/$/, "");

export interface MarketConfig {
  market_id: number;
  base: string;
  quote: string;
  base_decimals: number;
  quote_decimals: number;
  baseSymbol: string;
  quoteSymbol: string;
}

const symbolOf = (id: string) => (id === "wrap.testnet" ? "wNEAR" : id.startsWith("usdc.") ? "tUSDC" : id.split(".")[0]!);

export const MARKETS: MarketConfig[] = deployment.markets.map((m) => ({
  ...m,
  baseSymbol: symbolOf(m.base),
  quoteSymbol: symbolOf(m.quote),
}));
export const MARKET = MARKETS[0]!;

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;
