import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EbbflowTools } from "./tools.js";

const marketId = z.number().int().nonnegative().default(0).describe("Market id (0 = wNEAR/tUSDC)");
const side = z
  .enum(["buy_base", "sell_base"])
  .describe("buy_base: spend quote (tUSDC) to receive base (wNEAR). sell_base: sell base for quote.");
const baseAmount = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .optional()
  .describe('Exact base amount in whole tokens, e.g. "2.5"');
const quoteAmount = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .optional()
  .describe('buy_base only: spend at most this much quote, e.g. "10"');
const slippage = z.number().int().min(0).max(500).default(50).describe("Slippage tolerance in basis points");

const trade = { market_id: marketId, side, base_amount: baseAmount, quote_amount: quoteAmount, slippage_bps: slippage };

async function run(fn: () => Promise<unknown>, summarise: (r: never) => string): Promise<CallToolResult> {
  try {
    const result = await fn();
    return {
      content: [{ type: "text", text: `${summarise(result as never)}\n\n${JSON.stringify(result, null, 2)}` }],
    };
  } catch (e) {
    const err = e as Error & { code?: string; available?: bigint };
    const extra = err.available !== undefined ? ` (available raw: ${err.available})` : "";
    return { isError: true, content: [{ type: "text", text: `${err.code ?? err.name}: ${err.message}${extra}` }] };
  }
}

export function createServer(tools: EbbflowTools): McpServer {
  const server = new McpServer(
    { name: "ebbflow", version: "0.1.0" },
    {
      instructions:
        "Ebbflow is a NEAR order book where each maker order is a price curve. Typical flow: list_markets → " +
        "get_liquidity → get_quote → simulate_route → execute_swap. Trades settle atomically in one transaction: " +
        "either every leg fills or the input is refunded. Amounts are whole-token decimal strings.",
    },
  );

  server.registerTool(
    "list_markets",
    {
      title: "List markets",
      description: "Markets on the Ebbflow book with best bid/ask, number of positions and total depth.",
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.listMarkets(), (r: { markets: unknown[] }) => `${r.markets.length} market(s).`),
  );

  server.registerTool(
    "get_liquidity",
    {
      title: "Get liquidity",
      description: "Per-maker curves (asks and bids) and cumulative depth by price level for a market.",
      inputSchema: { market_id: marketId, levels: z.number().int().min(2).max(50).default(10).describe("Depth price levels") },
      annotations: { readOnlyHint: true },
    },
    (a) =>
      run(() => tools.getLiquidity(a), (r: { best_ask: string | null; best_bid: string | null; asks: unknown[]; bids: unknown[] }) =>
        `Best bid ${r.best_bid ?? "—"} / best ask ${r.best_ask ?? "—"}; ${r.asks.length} ask and ${r.bids.length} bid position(s).`,
      ),
  );

  server.registerTool(
    "get_quote",
    {
      title: "Get quote",
      description:
        "Best route across up to 8 makers for a trade, with average price, price impact, limits and the exact " +
        "ft_transfer_call to sign. Provide base_amount, or quote_amount for buys.",
      inputSchema: trade,
      annotations: { readOnlyHint: true },
    },
    (a) =>
      run(() => tools.getQuote(a), (r: { amount_in: string; amount_out: string; avg_price: string; legs: unknown[]; price_impact_bps: number }) =>
        `Pay ${r.amount_in}, receive ${r.amount_out} at avg ${r.avg_price} across ${r.legs.length} maker(s); impact ${r.price_impact_bps} bps.`,
      ),
  );

  server.registerTool(
    "simulate_route",
    {
      title: "Simulate route",
      description: "Quotes a trade and dry-runs it against the contract's simulate_swap view. Nothing is sent.",
      inputSchema: trade,
      annotations: { readOnlyHint: true },
    },
    (a) => run(() => tools.simulateRoute(a), (r: { ok: boolean; error: string | null }) => (r.ok ? "Simulation OK." : `Simulation failed: ${r.error}`)),
  );

  server.registerTool(
    "compare_liquidity",
    {
      title: "Compare liquidity",
      description: "Compares Ebbflow's multi-maker route with filling the same size from the single best maker.",
      inputSchema: { market_id: marketId, side, base_amount: z.string().regex(/^\d+(\.\d+)?$/).describe("Base size in whole tokens") },
      annotations: { readOnlyHint: true },
    },
    (a) =>
      run(() => tools.compareLiquidity(a), (r: { ebbflow: { avg_price: string; legs: number } }) =>
        `Ebbflow avg ${r.ebbflow.avg_price} using ${r.ebbflow.legs} maker(s).`,
      ),
  );

  server.registerTool(
    "execute_swap",
    {
      title: "Execute swap",
      description:
        "Quotes, checks the agent's per-trade and daily limits, simulates, then signs and sends the swap from the " +
        "agent's own budgeted account. All-or-nothing: on failure the input is refunded. Set dry_run to stop before sending.",
      inputSchema: { ...trade, dry_run: z.boolean().default(false) },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    (a) =>
      run(() => tools.executeSwap(a), (r: { status: string; amount_in?: string; amount_out?: string; explorer_url?: string; reject_reason?: string }) =>
        r.status === "filled"
          ? `Filled: paid ${r.amount_in}, received ${r.amount_out}. ${r.explorer_url ?? ""}`
          : r.status === "dry_run"
            ? "Dry run OK; nothing sent."
            : `Status ${r.status}${r.reject_reason ? ` (${r.reject_reason})` : ""}. ${r.explorer_url ?? ""}`,
      ),
  );

  server.registerTool(
    "intents_tokens",
    {
      title: "NEAR Intents tokens",
      description:
        "Assets on other chains that NEAR Intents can swap into this agent's NEAR account (mainnet only). Use the assetId " +
        "values with intents_fund_quote. Needs INTENTS_API_KEY on the server.",
      inputSchema: {
        query: z.string().optional().describe('Filter by symbol, chain or asset id, e.g. "usdc" or "eth"'),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (a) => run(() => tools.intentsTokens(a), (r: { count: number }) => `${r.count} asset(s).`),
  );

  server.registerTool(
    "intents_fund_quote",
    {
      title: "Quote cross-chain funding",
      description:
        "Dry-run quote for swapping an asset from another chain into a token on NEAR, delivered to the agent's own account " +
        "so it can trade on Ebbflow. Moves no funds. amount is in the origin asset's smallest unit.",
      inputSchema: {
        origin_asset: z.string().describe("Intents asset id to pay with, from intents_tokens"),
        destination_asset: z.string().describe("Intents asset id to receive, e.g. nep141:wrap.near"),
        amount: z.string().regex(/^\d+$/).describe("Origin amount, smallest unit"),
        refund_to: z.string().describe("Address on the origin chain to refund if the swap fails"),
        slippage_bps: z.number().int().min(1).max(500).default(100),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (a) => run(() => tools.intentsFundQuote(a), () => "Dry quote only; nothing was sent."),
  );

  server.registerTool(
    "get_agent_balance",
    {
      title: "Get agent balance",
      description: "The agent account's NEAR, wallet token balances, balances held in the book, and remaining limits.",
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.getAgentBalance(), (r: { account_id: string; near: string }) => `${r.account_id}: ${r.near} NEAR.`),
  );

  return server;
}
