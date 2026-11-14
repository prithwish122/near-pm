// TST-S5: MCP tools, budget guard rails and the MCP protocol surface.
import { newSide, parsePrice, parseUnits, sideToJson, type Side } from "@ebbflow/curve-math";
import type { BookSource, Market, PositionView, SimulateView, SwapMsg } from "@ebbflow/solver";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { OneClick } from "@ebbflow/solver";
import { Budget } from "../src/budget.js";
import { createServer } from "../src/server.js";
import { EbbflowTools, type Chain } from "../src/tools.js";
import type { AgentWallet, TxResult } from "../src/wallet.js";

const MARKET: Market = { market_id: 0, base: "wrap.testnet", quote: "usdc.testnet", base_decimals: 24, quote_decimals: 6 };
const B = (h: string) => parseUnits(h, 24);
const Q = (h: string) => parseUnits(h, 6);
const P = (h: string) => parsePrice(h, 6);

function position(id: string, owner: string, ask?: Side, bid?: Side): PositionView {
  return {
    position_id: id,
    owner_id: owner,
    market_id: 0,
    ask: ask ? sideToJson(ask) : null,
    bid: bid ? sideToJson(bid) : null,
    bid_base_capacity: "0",
    stats: { base_sold: "0", quote_received: "0", base_bought: "0", quote_spent: "0", fills: 0 },
    created_at_ms: 0,
  };
}

class Source implements BookSource {
  contractId = "book.testnet";
  network = "sandbox";
  simulateOk = true;
  registered = new Set<string>();
  positions = [
    position("0", "priya.testnet", newSide(B("4"), P("5.04"), P("5.20"), 1), newSide(Q("2000"), P("4.96"), P("4.80"), 1)),
    position("1", "arjun.testnet", newSide(B("1"), P("5.06"), P("5.06"), 0)),
  ];
  async getMarkets() {
    return [MARKET];
  }
  async getPositions() {
    return this.positions;
  }
  async simulateSwap(_m: SwapMsg, amount: string): Promise<SimulateView> {
    return this.simulateOk
      ? { ok: true, error: null, legs: [], amount_in_used: amount, amount_out: "1", refund: "0" }
      : { ok: false, error: "E05_POSITION_NOT_FOUND", legs: [], amount_in_used: "0", amount_out: "0", refund: amount };
  }
  async isRegistered(token: string, account: string) {
    return this.registered.has(`${token}:${account}`);
  }
  async blockHeight() {
    return 1;
  }
}

const swapLog = (amountIn: string, amountOut: string) =>
  `EVENT_JSON:${JSON.stringify({
    standard: "ebbflow",
    version: "1.0.0",
    event: "swap",
    data: [{ amount_in: amountIn, amount_out: amountOut, refund: "50506" }],
  })}`;

class FakeWallet implements AgentWallet {
  accountId = "agent.testnet";
  calls: { contract: string; method: string; args: object; deposit: bigint }[] = [];
  logs: string[] = [swapLog("10101145", B("2").toString())];
  async call(contract: string, method: string, args: object, deposit: bigint): Promise<TxResult> {
    this.calls.push({ contract, method, args, deposit });
    return { hash: "TXHASH", success: true, logs: method === "ft_transfer_call" ? this.logs : [] };
  }
}

const chain: Chain = {
  async view<T>(_a: string, method: string): Promise<T> {
    return (method === "ft_balance_of" ? "5000000" : "0") as T;
  },
  async nearBalance() {
    return 10n ** 25n;
  },
};

const limits = { maxTradeBase: "10", maxTradeQuote: "50", maxDailyQuote: "25" };
let source: Source;
let wallet: FakeWallet;
let tools: EbbflowTools;

beforeEach(() => {
  source = new Source();
  wallet = new FakeWallet();
  tools = new EbbflowTools({
    source,
    chain,
    wallet,
    budget: new Budget(limits),
    config: { explorerTxUrl: "https://testnet.nearblocks.io/txns/", limits },
  });
});

describe("read tools", () => {
  it("list_markets summarises the book", async () => {
    const r = await tools.listMarkets();
    expect(r.markets[0]).toMatchObject({ best_ask: "5.04", best_bid: "4.96", positions: 2 });
  });

  it("get_liquidity lists makers by kind", async () => {
    const r = await tools.getLiquidity({ market_id: 0 });
    expect(r.asks.map((a) => a.kind)).toEqual(["curve", "limit"]);
    expect(r.bids).toHaveLength(1);
    expect(r.depth.asks.length).toBeGreaterThan(2);
  });

  it("get_quote routes across both makers for 2 wNEAR", async () => {
    const q = await tools.getQuote({ market_id: 0, side: "buy_base", base_amount: "2" });
    expect(q.legs.map((l) => l.maker)).toEqual(["priya.testnet", "arjun.testnet"]);
    expect(q.amount_out).toBe("2");
  });

  it("compare_liquidity shows the multi-maker improvement", async () => {
    const r = await tools.compareLiquidity({ market_id: 0, side: "buy_base", base_amount: "2" });
    expect(r.ebbflow.legs).toBe(2);
    expect(r.best_single_maker).toMatchObject({ maker: "priya.testnet" });
    expect((r.best_single_maker as { ebbflow_improvement_bps: number }).ebbflow_improvement_bps).toBeGreaterThan(0);
  });

  it("rejects bad trade args", async () => {
    await expect(tools.getQuote({ market_id: 0, side: "buy_base" })).rejects.toThrow(/exactly one/);
  });
});

describe("execute_swap", () => {
  it("registers for the output token, sends one ft_transfer_call and reports the fill", async () => {
    const r = await tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "2" });
    expect(r.status).toBe("filled");
    expect(r.amount_out).toBe("2");
    expect(r.explorer_url).toBe("https://testnet.nearblocks.io/txns/TXHASH");
    expect(wallet.calls.map((c) => c.method)).toEqual(["storage_deposit", "ft_transfer_call"]);
    const swap = wallet.calls[1]!;
    expect(swap.contract).toBe("usdc.testnet");
    expect(swap.deposit).toBe(1n);
    expect(JSON.parse((swap.args as { msg: string }).msg).legs).toHaveLength(2);
  });

  it("skips registration when already registered", async () => {
    source.registered.add("wrap.testnet:agent.testnet");
    await tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "1" });
    expect(wallet.calls.map((c) => c.method)).toEqual(["ft_transfer_call"]);
  });

  it("dry_run sends nothing", async () => {
    const r = await tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "1", dry_run: true });
    expect(r.status).toBe("dry_run");
    expect(wallet.calls).toEqual([]);
  });

  it("aborts when simulation fails", async () => {
    source.simulateOk = false;
    await expect(tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "1" })).rejects.toThrow(/simulation failed/);
    expect(wallet.calls).toEqual([]);
  });

  it("enforces per-trade caps", async () => {
    const tight = { maxTradeBase: "1.5", maxTradeQuote: "5", maxDailyQuote: "1000" };
    const t = new EbbflowTools({ source, chain, wallet, budget: new Budget(tight), config: { explorerTxUrl: "", limits: tight } });
    await expect(t.executeSwap({ market_id: 0, side: "buy_base", base_amount: "2" })).rejects.toThrow(/MAX_TRADE_BASE/);
    await expect(t.executeSwap({ market_id: 0, side: "buy_base", base_amount: "1.2" })).rejects.toThrow(/MAX_TRADE_QUOTE/);
    await expect(t.executeSwap({ market_id: 0, side: "buy_base", base_amount: "0.5" })).resolves.toMatchObject({ status: "filled" });
    expect(wallet.calls.filter((c) => c.method === "ft_transfer_call")).toHaveLength(1);
  });

  it("enforces the daily cap across trades", async () => {
    await tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "2" }); // ~10.15
    await tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "2" }); // ~20.3
    await expect(tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "1" })).rejects.toThrow(/MAX_DAILY_QUOTE/);
  });

  it("reports refunded routes", async () => {
    wallet.logs = [
      `EVENT_JSON:${JSON.stringify({ standard: "ebbflow", version: "1.0.0", event: "swap_rejected", data: [{ reason: "E05_POSITION_NOT_FOUND", amount_refunded: "5000000" }] })}`,
    ];
    const r = await tools.executeSwap({ market_id: 0, side: "buy_base", base_amount: "0.5" });
    expect(r).toMatchObject({ status: "refunded", reject_reason: "E05_POSITION_NOT_FOUND", refund: "5" });
  });

  it("requires a wallet", async () => {
    const ro = new EbbflowTools({ source, chain, budget: new Budget(limits), config: { explorerTxUrl: "", limits } });
    await expect(ro.executeSwap({ market_id: 0, side: "buy_base", base_amount: "1" })).rejects.toThrow(/no agent wallet/);
  });
});

describe("get_agent_balance", () => {
  it("reports wallet, book balances and remaining daily limit", async () => {
    const r = await tools.getAgentBalance();
    expect(r.near).toBe("10");
    expect(r.tokens).toContainEqual({ token: "usdc.testnet", wallet: "5", in_book: "0" });
    expect(r.daily_quote_remaining).toEqual([{ market_id: 0, remaining: "25" }]);
  });
});

describe("MCP protocol", () => {
  async function connect() {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await createServer(tools).connect(serverT);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientT);
    return client;
  }

  it("exposes the nine agent tools", async () => {
    const client = await connect();
    const { tools: list } = await client.listTools();
    expect(list.map((t) => t.name).sort()).toEqual(
      [
        "compare_liquidity",
        "execute_swap",
        "get_agent_balance",
        "get_liquidity",
        "get_quote",
        "intents_fund_quote",
        "intents_tokens",
        "list_markets",
        "simulate_route",
      ].sort(),
    );
    expect(list.find((t) => t.name === "execute_swap")!.annotations?.destructiveHint).toBe(true);
  });

  it("calls a tool end to end", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "get_quote", arguments: { side: "buy_base", base_amount: "2" } });
    const text = (r.content as { type: string; text: string }[])[0]!.text;
    expect(text).toMatch(/^Pay 10\.1\d+, receive 2 at avg 5\.05/);
    expect(r.isError).toBeFalsy();
  });

  it("returns tool errors as isError results", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "get_quote", arguments: { side: "buy_base", base_amount: "999" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]!.text).toMatch(/INSUFFICIENT_LIQUIDITY/);
  });
});

describe("NEAR Intents tools", () => {
  const calls: { url: string; body?: string }[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    if (url.endsWith("/v0/tokens")) {
      return new Response(
        JSON.stringify([
          { assetId: "nep141:wrap.near", symbol: "wNEAR", blockchain: "near", decimals: 24 },
          { assetId: "nep141:eth-usdc.omft.near", symbol: "USDC", blockchain: "eth", decimals: 6 },
        ]),
      );
    }
    return new Response(JSON.stringify({ quote: { amountOut: "1", depositAddress: undefined } }));
  }) as unknown as typeof fetch;
  const withIntents = () =>
    new EbbflowTools({
      source,
      chain,
      wallet,
      budget: new Budget(limits),
      config: { explorerTxUrl: "", limits },
      oneClick: new OneClick("k", "https://oc.test", fake),
    });

  it("filters tokens", async () => {
    const r = await withIntents().intentsTokens({ query: "eth" });
    expect(r.tokens.map((t) => t.symbol)).toEqual(["USDC"]);
  });

  it("requests a dry quote delivered to the agent account", async () => {
    await withIntents().intentsFundQuote({ origin_asset: "nep141:eth-usdc.omft.near", destination_asset: "nep141:wrap.near", amount: "1000000", refund_to: "0xabc" });
    const sent = JSON.parse(calls.find((c) => c.url.endsWith("/v0/quote"))!.body!);
    expect(sent).toMatchObject({ dry: true, recipient: wallet.accountId, refundTo: "0xabc", swapType: "EXACT_INPUT" });
  });

  it("explains when Intents is not configured", async () => {
    await expect(tools.intentsTokens({})).rejects.toThrow(/not configured/);
  });
});
