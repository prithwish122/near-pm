/**
 * Vercel entry point: the same Hono app as `src/index.ts`, served as one serverless function.
 * `vercel.json` rewrites every path here. Built from `dist/` (the build step runs `tsc`).
 * Uses Web Request/Response handlers: the Node adapter can't read bodies Vercel has already consumed.
 */
import { NearBookSource, NearRpc } from "../dist/chain.js";
import { createApp } from "../dist/server.js";

const network = process.env.NEAR_NETWORK ?? "testnet";
const contract = process.env.EBBFLOW_CONTRACT;
if (!contract) throw new Error("set EBBFLOW_CONTRACT");
const urls = (process.env.NEAR_RPC_URLS ?? "https://test.rpc.fastnear.com,https://rpc.testnet.near.org")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ttl = Number(process.env.CACHE_TTL_SECONDS ?? 2) * 1000;

const source = new NearBookSource(new NearRpc(urls), contract, network, ttl);

const app = createApp(source);

// Web-standard handlers: Vercel passes a Request and Hono answers with a Response, body untouched.
const handler = (req) => app.fetch(req);
export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
