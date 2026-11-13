import { serve } from "@hono/node-server";
import { readFileSync } from "node:fs";
import { NearBookSource, NearRpc } from "./chain.js";
import { createApp } from "./server.js";

/** Contract id from env, else from `deployments/<network>.json` written by scripts/deploy.sh. */
function contractId(network: string): string {
  if (process.env.EBBFLOW_CONTRACT) return process.env.EBBFLOW_CONTRACT;
  try {
    const url = new URL(`../../../deployments/${network}.json`, import.meta.url);
    return (JSON.parse(readFileSync(url, "utf8")) as { book: string }).book;
  } catch {
    throw new Error("set EBBFLOW_CONTRACT or run scripts/deploy.sh to create deployments/testnet.json");
  }
}

const network = process.env.NEAR_NETWORK ?? "testnet";
const urls = (process.env.NEAR_RPC_URLS ?? "https://test.rpc.fastnear.com,https://rpc.testnet.near.org")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ttl = Number(process.env.CACHE_TTL_SECONDS ?? 2) * 1000;
const port = Number(process.env.PORT ?? 8787);

const source = new NearBookSource(new NearRpc(urls), contractId(network), network, ttl);
serve({ fetch: createApp(source).fetch, port }, (info) => {
  console.log(`ebbflow solver on :${info.port} → ${source.contractId} (${network})`);
});
