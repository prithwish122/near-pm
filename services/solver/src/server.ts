import { CurveError, parseUnits } from "@ebbflow/curve-math";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { RpcError } from "./chain.js";
import { curves, summary } from "./curves.js";
import { buildQuote, MAX_SLIPPAGE_BPS } from "./quote.js";
import { RouteError, routeBuyWithQuote, routeExactBase } from "./router.js";
import type { BookSource, Market } from "./types.js";

const amount = z.string().regex(/^\d+(\.\d+)?$/, "decimal string");
const rawAmount = z.string().regex(/^\d+$/, "integer string");
const account = z.string().min(2).max(64);

export const QuoteRequest = z
  .object({
    market_id: z.number().int().nonnegative(),
    side: z.enum(["buy_base", "sell_base"]),
    /** Exact base size, human units ("200"). */
    base_amount: amount.optional(),
    base_amount_raw: rawAmount.optional(),
    /** Buy only: spend at most this much quote. */
    quote_amount: amount.optional(),
    quote_amount_raw: rawAmount.optional(),
    slippage_bps: z.number().int().min(0).max(MAX_SLIPPAGE_BPS).default(50),
    taker: account.optional(),
    recipient: account.optional(),
    /** Skip the taker's own positions. */
    exclude_own: z.boolean().default(true),
  })
  .refine(
    (q) => [q.base_amount, q.base_amount_raw, q.quote_amount, q.quote_amount_raw].filter((v) => v !== undefined).length === 1,
    "provide exactly one of base_amount, base_amount_raw, quote_amount, quote_amount_raw",
  )
  .refine(
    (q) => q.side === "buy_base" || (q.quote_amount === undefined && q.quote_amount_raw === undefined),
    "quote_amount is only supported for buy_base",
  );
export type QuoteRequest = z.infer<typeof QuoteRequest>;

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

class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 422 | 502,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function findMarket(source: BookSource, id: number): Promise<Market> {
  const m = (await source.getMarkets()).find((x) => x.market_id === id);
  if (!m) throw new HttpError(404, "MARKET_NOT_FOUND", `market ${id} not found`);
  return m;
}

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

export function createApp(source: BookSource) {
  const app = new Hono();
  app.use("*", cors());

  app.onError((err, c) => {
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

  app.post("/quote", async (c) => {
    const q = await body(c, QuoteRequest);
    const market = await findMarket(source, q.market_id);
    const positions = await source.getPositions(market.market_id);
    const opts = { excludeOwner: q.exclude_own ? q.taker : undefined };

    let route;
    try {
      if (q.quote_amount !== undefined || q.quote_amount_raw !== undefined) {
        const budget = q.quote_amount_raw !== undefined ? BigInt(q.quote_amount_raw) : parseUnits(q.quote_amount!, market.quote_decimals);
        route = routeBuyWithQuote(positions, market, budget, opts);
      } else {
        const size = q.base_amount_raw !== undefined ? BigInt(q.base_amount_raw) : parseUnits(q.base_amount!, market.base_decimals);
        route = routeExactBase(positions, market, q.side, size, opts);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("too many decimals")) {
        throw new HttpError(400, "INVALID_REQUEST", e.message);
      }
      throw e;
    }

    const quote = buildQuote(route, market, source.contractId, q.slippage_bps, q.recipient);
    const receiver = q.recipient ?? q.taker;
    if (receiver) {
      const outputToken = q.side === "buy_base" ? market.base : market.quote;
      try {
        if (!(await source.isRegistered(outputToken, receiver))) {
          quote.warnings.push("recipient_not_registered_with_output_token");
        }
      } catch {
        quote.warnings.push("registration_check_failed");
      }
    }
    return c.json(quote);
  });

  app.post("/simulate", async (c) => {
    const r = await body(c, SimulateRequest);
    return c.json(await source.simulateSwap(r.msg, r.amount));
  });

  return app;
}
