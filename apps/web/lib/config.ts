import mainnetDeployment from "../../../deployments/mainnet.json";
import testnetDeployment from "../../../deployments/testnet.json";

/**
 * Network is chosen at build/start time: NEXT_PUBLIC_NEAR_NETWORK=mainnet|testnet (default testnet).
 * Mainnet reads deployments/mainnet.json, written by scripts/deploy-mainnet.sh.
 */
export type Network = "mainnet" | "testnet";
export const NETWORK: Network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const IS_MAINNET = NETWORK === "mainnet";

const deployment = IS_MAINNET ? mainnetDeployment : testnetDeployment;
if (IS_MAINNET && !deployment.book) {
  throw new Error("Mainnet selected but deployments/mainnet.json has no book. Run scripts/deploy-mainnet.sh first.");
}

export const BOOK: string = deployment.book;
export const OWNER: string = deployment.owner;
export const EXPLORER = IS_MAINNET ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

const DEFAULT_RPC = IS_MAINNET
  ? "https://free.rpc.fastnear.com,https://rpc.mainnet.near.org"
  : "https://test.rpc.fastnear.com,https://rpc.testnet.near.org";
export const RPC_URLS = (process.env.NEXT_PUBLIC_NEAR_RPC_URLS ?? DEFAULT_RPC)
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

const MAINNET_USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const symbolOf = (id: string) =>
  id === "wrap.testnet" || id === "wrap.near" ? "wNEAR" : id === MAINNET_USDC ? "USDC" : id.startsWith("usdc.") ? "tUSDC" : id.split(".")[0]!;

export const MARKETS: MarketConfig[] = deployment.markets.map((m) => ({
  ...m,
  baseSymbol: symbolOf(m.base),
  quoteSymbol: symbolOf(m.quote),
}));
export const MARKET = MARKETS[0]!;

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

/** Test tokens (faucet, tUSDC) exist on testnet only. */
export const HAS_FAUCET = !IS_MAINNET;
export const QUOTE_SYMBOL = MARKET.quoteSymbol;
export const NETWORK_NOTE = IS_MAINNET ? "mainnet, unaudited: use small amounts" : "testnet only, not audited";
