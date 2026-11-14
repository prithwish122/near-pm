import { CurveError } from "@ebbflow/curve-math";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { OneClick, OneClickError } from "./intents/oneclick.js";
import { RpcError } from "./chain.js";
import { curves, summary } from "./curves.js";
import { RouteError } from "./router.js";
import { findMarket, getQuote, HttpError, QuoteRequest } from "./service.js";
import type { BookSource } from "./types.js";

const rawAmount = z.string().regex(/^\d+$/, "integer string");
const account = z.string().min(2).max(64);

const SimulateRequest = z.object({
  msg: z.object({
    market_id: z.number().int().nonnegative(),
    side: z.enum(["buy_base", "sell_base"]),
    legs: z.array(z.object({ position_id: rawAmount, base_amount: rawAmount })).min(1),
    min_amount_out: rawAmount,
    recipient: account.nullish(),
  }),
  amount: rawAmount,
});

async function body<T>(c: Context, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new HttpError(400, "INVALID_REQUEST", "body must be JSON");
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    throw new HttpError(400, "INVALID_REQUEST", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return r.data;
}

export function createApp(source: BookSource, oneClick: OneClick = new OneClick(process.env.INTENTS_API_KEY)) {
  const app = new Hono();
  app.use("*", cors());

  app.onError((err, c) => {
    if (err instanceof OneClickError) {
      return c.json({ error: "INTENTS_ERROR", message: err.message }, err.status === 503 ? 503 : 502);
    }
    if (err instanceof HttpError) {
      return c.json({ error: err.code, message: err.message, ...err.extra }, err.status);
    }
    if (err instanceof RouteError) {
      const status = err.code === "INVALID_REQUEST" ? 400 : 422;
      return c.json(
        { error: err.code, message: err.message, ...(err.available !== undefined ? { available_raw: err.available.toString() } : {}) },
        status,
      );
    }
    if (err instanceof CurveError) return c.json({ error: "ROUTE_FAILED", message: err.code }, 422);
    if (err instanceof RpcError) return c.json({ error: "RPC_ERROR", message: err.message }, 502);
    console.error(err);
    return c.json({ error: "INTERNAL", message: "internal error" }, 500);
  });

  app.get("/health", async (c) => {
    let block_height: number | null = null;
    try {
      block_height = await source.blockHeight();
    } catch {
      /* report unhealthy RPC below */
    }
    return c.json({ ok: block_height !== null, network: source.network, contract: source.contractId, block_height });
  });

  app.get("/markets", async (c) => {
    const markets = await source.getMarkets();
    const rows = await Promise.all(
      markets.map(async (m) => ({ ...m, ...summary(await source.getPositions(m.market_id), m) })),
    );
    return c.json(rows);
  });

  app.get("/markets/:id/positions", async (c) => {
    const m = await findMarket(source, Number(c.req.param("id")));
    return c.json(await source.getPositions(m.market_id));
  });

  app.get("/markets/:id/curves", async (c) => {
    const m = await findMarket(source, Number(c.req.param("id")));
    const points = Math.min(200, Math.max(2, Number(c.req.query("points") ?? 50) || 50));
    return c.json(curves(await source.getPositions(m.market_id), m, points));
  });

  app.post("/quote", async (c) => c.json(await getQuote(source, await body(c, QuoteRequest))));

  app.post("/simulate", async (c) => {
    const r = await body(c, SimulateRequest);
    return c.json(await source.simulateSwap(r.msg, r.amount));
  });

  // NEAR Intents (1Click): fund an Ebbflow trade from any chain. Mainnet only; the API key stays here.
  app.get("/intents/tokens", async (c) => c.json({ enabled: oneClick.hasKey, dry_quotes: true, tokens: await oneClick.getTokens() }));

  app.post("/intents/swap-quote", async (c) => {
    const r = await body(
      c,
      z.object({
        origin_asset: z.string().min(3),
        destination_asset: z.string().min(3),
        amount: rawAmount,
        recipient: account,
        refund_to: z.string().min(3),
        slippage_bps: z.number().int().min(1).max(500).default(100),
        dry: z.boolean().default(true),
      }),
    );
    return c.json(
      await oneClick.quote({
        originAsset: r.origin_asset,
        destinationAsset: r.destination_asset,
        amount: r.amount,
        recipient: r.recipient,
        refundTo: r.refund_to,
        slippageBps: r.slippage_bps,
        dry: r.dry,
      }),
    );
  });

  app.get("/intents/status", async (c) => {
    const addr = c.req.query("deposit_address");
    if (!addr) throw new HttpError(400, "INVALID_REQUEST", "deposit_address is required");
    return c.json(await oneClick.status(addr));
  });

  return app;
}
