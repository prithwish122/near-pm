import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { MemorySource, prdBook } from "./fixtures.js";

function app(source = new MemorySource(prdBook())) {
  const a = createApp(source);
  const post = (path: string, body: unknown) =>
    a.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { a, post, source };
}

describe("HTTP API", () => {
  it("GET /health", async () => {
    const res = await app().a.request("/health");
    expect(await res.json()).toMatchObject({ ok: true, contract: "book.testnet" });
  });

  it("GET /markets summarises the book", async () => {
    const [m] = await (await app().a.request("/markets")).json();
    expect(m).toMatchObject({ market_id: 0, best_ask: "5.04", best_bid: "4.96", positions: 2, depth_base_ask: "500" });
  });

  it("GET /markets/:id/curves returns per-position curves and depth", async () => {
    const body = await (await app().a.request("/markets/0/curves?points=4")).json();
    expect(body.positions).toHaveLength(3); // Priya ask + bid, Arjun ask
    const priyaAsk = body.positions.find((p: { side: string; alpha: number }) => p.side === "ask" && p.alpha === 1);
    expect(priyaAsk.points[0]).toEqual({ base: 0, price: 5.04 });
    expect(priyaAsk.points.at(-1)).toEqual({ base: 400, price: 5.2 });
    expect(body.depth.asks.at(-1).base).toBeCloseTo(500);
  });

  it("POST /quote returns a route and tx args", async () => {
    const res = await app().post("/quote", { market_id: 0, side: "buy_base", base_amount: "200" });
    expect(res.status).toBe(200);
    const q = await res.json();
    expect(q.legs).toHaveLength(2);
    expect(q.amount_out).toBe("200");
    expect(q.tx.method_name).toBe("ft_transfer_call");
  });

  it("warns when the recipient is not registered with the output token", async () => {
    const { post, source } = app();
    let q = await (await post("/quote", { market_id: 0, side: "buy_base", base_amount: "1", taker: "rahul.testnet" })).json();
    expect(q.warnings).toContain("recipient_not_registered_with_output_token");
    source.registered.add("wrap.testnet:rahul.testnet");
    q = await (await post("/quote", { market_id: 0, side: "buy_base", base_amount: "1", taker: "rahul.testnet" })).json();
    expect(q.warnings).toEqual([]);
  });

  it("validates input", async () => {
    const { post } = app();
    expect((await post("/quote", { market_id: 0, side: "buy_base" })).status).toBe(400);
    expect((await post("/quote", { market_id: 0, side: "sell_base", quote_amount: "5" })).status).toBe(400);
    expect((await post("/quote", { market_id: 0, side: "buy_base", base_amount: "1", slippage_bps: 9999 })).status).toBe(400);
    expect((await post("/quote", { market_id: 9, side: "buy_base", base_amount: "1" })).status).toBe(404);
  });

  it("returns 422 with available size when liquidity is short", async () => {
    const res = await app().post("/quote", { market_id: 0, side: "buy_base", base_amount: "1000" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "INSUFFICIENT_LIQUIDITY", available_raw: (500n * 10n ** 24n).toString() });
  });

  it("POST /simulate proxies to the contract view", async () => {
    const res = await app().post("/simulate", {
      msg: { market_id: 0, side: "buy_base", legs: [{ position_id: "0", base_amount: "1" }], min_amount_out: "1" },
      amount: "10",
    });
    expect((await res.json()).ok).toBe(true);
  });
});
