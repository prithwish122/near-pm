/**
 * NEAR Intents market-maker for an Ebbflow deployment (mainnet for real flow).
 *
 *   pnpm intents            run the bus client (dry run unless INTENTS_RESPOND=1)
 *   pnpm intents setup      one-off: register the signing key and token storage
 */
import { readFileSync } from "node:fs";
import { NearBookSource, NearRpc } from "./chain.js";
import { NonceSource, Rebalancer, SolverAccount, SolverBus, signerFromSecretKey } from "./intents/index.js";

const network = process.env.NEAR_NETWORK ?? "mainnet";
const book =
  process.env.EBBFLOW_CONTRACT ??
  (JSON.parse(readFileSync(new URL(`../../../deployments/${network}.json`, import.meta.url), "utf8")) as { book: string }).book;
const urls = (process.env.NEAR_RPC_URLS ?? "https://rpc.mainnet.near.org").split(",").map((s) => s.trim());
const rpc = new NearRpc(urls);
const source = new NearBookSource(rpc, book, network, 2000);

const accountId = process.env.INTENTS_SOLVER_ACCOUNT;
const key = process.env.INTENTS_SOLVER_KEY;
const marketId = Number(process.env.INTENTS_MARKET_ID ?? 0);
const account = accountId && key ? new SolverAccount(accountId, key, urls[0]!, rpc) : undefined;
const signer = accountId && key ? signerFromSecretKey(accountId, key) : undefined;

if (process.argv[2] === "setup") {
  if (!account || !signer) throw new Error("set INTENTS_SOLVER_ACCOUNT and INTENTS_SOLVER_KEY");
  const market = (await source.getMarkets()).find((m) => m.market_id === marketId);
  if (!market) throw new Error(`market ${marketId} not found`);
  console.log(`registering ${signer.publicKey} with intents.near`);
  await account.registerKey(signer.publicKey);
  for (const token of [market.base, market.quote]) {
    console.log(`storage on ${token}`);
    await account.registerStorage(token).catch((e: Error) => console.log(`  skipped: ${e.message}`));
  }
  console.log("done. Now deposit inventory into intents.near (ft_transfer_call with msg = solver account).");
  process.exit(0);
}

const nonces = new NonceSource(rpc);
const respond = process.env.INTENTS_RESPOND === "1";
if (respond && (!account || !signer)) throw new Error("INTENTS_RESPOND=1 needs INTENTS_SOLVER_ACCOUNT and INTENTS_SOLVER_KEY");

const rebalancer =
  respond && account
    ? new Rebalancer({ source, chain: account, marketId, minBase: BigInt(process.env.INTENTS_MIN_HEDGE_BASE_RAW ?? "0") })
    : undefined;
await rebalancer?.init();
const hedge = () => {
  rebalancer?.rebalance().then((r) => console.log("[hedge]", r)).catch((e: Error) => console.error("[hedge] failed:", e.message));
};

const bus = new SolverBus({
  url: process.env.INTENTS_WS_URL,
  token: process.env.INTENTS_JWT,
  source,
  signer: respond ? signer : undefined,
  nonce: respond ? () => nonces.next() : undefined,
  inventory: respond && account ? (assetId) => account.intentsBalance(assetId.replace(/^nep141:/, "")) : undefined,
  onSettled: hedge,
  quoter: {
    marginBps: Number(process.env.INTENTS_MARGIN_BPS ?? 30),
    // Default cap: 5 USDC (6 decimals), matching the "tiny amounts" mainnet plan.
    maxQuoteRaw: BigInt(process.env.INTENTS_MAX_QUOTE_RAW ?? "5000000"),
  },
});
if (rebalancer) setInterval(hedge, Number(process.env.INTENTS_HEDGE_INTERVAL_MS ?? 30_000)).unref();
console.log(`ebbflow intents solver → ${book} (${network}) ${respond ? "RESPONDING + hedging" : "dry-run (set INTENTS_RESPOND=1 + key to respond)"}`);
await bus.start();
