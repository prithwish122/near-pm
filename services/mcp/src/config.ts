import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  network: string;
  contractId: string;
  rpcUrls: string[];
  explorerTxUrl: string;
  agent?: { accountId: string; privateKey: string };
  /** Per-trade and daily caps in whole tokens (human units). */
  limits: { maxTradeBase: string; maxTradeQuote: string; maxDailyQuote: string };
}

function contractId(network: string): string {
  if (process.env.EBBFLOW_CONTRACT) return process.env.EBBFLOW_CONTRACT;
  const url = new URL(`../../../deployments/${network}.json`, import.meta.url);
  try {
    return (JSON.parse(readFileSync(url, "utf8")) as { book: string }).book;
  } catch {
    throw new Error("set EBBFLOW_CONTRACT or deploy with scripts/deploy.sh (deployments/<network>.json)");
  }
}

/** Agent key from AGENT_PRIVATE_KEY, else near-cli's legacy keychain file. */
function agentKey(network: string, accountId: string): string | undefined {
  if (process.env.AGENT_PRIVATE_KEY) return process.env.AGENT_PRIVATE_KEY;
  const file = join(homedir(), ".near-credentials", network, `${accountId}.json`);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as { private_key?: string }).private_key;
}

export function loadConfig(): Config {
  const network = process.env.NEAR_NETWORK ?? "testnet";
  const rpcUrls = (process.env.NEAR_RPC_URLS ?? "https://test.rpc.fastnear.com,https://rpc.testnet.near.org")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const accountId = process.env.AGENT_ACCOUNT_ID;
  let agent: Config["agent"];
  if (accountId) {
    const privateKey = agentKey(network, accountId);
    if (!privateKey) {
      throw new Error(`no key for ${accountId}: set AGENT_PRIVATE_KEY or save it to ~/.near-credentials/${network}/`);
    }
    agent = { accountId, privateKey };
  }
  return {
    network,
    contractId: contractId(network),
    rpcUrls,
    explorerTxUrl: process.env.EXPLORER_TX_URL ?? `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/`,
    agent,
    limits: {
      maxTradeBase: process.env.MAX_TRADE_BASE ?? "10",
      maxTradeQuote: process.env.MAX_TRADE_QUOTE ?? "50",
      maxDailyQuote: process.env.MAX_DAILY_QUOTE ?? "200",
    },
  };
}
