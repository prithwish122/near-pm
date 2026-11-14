import { describe, expect, it } from "vitest";
import { NonceSource, Rebalancer, type HedgeChain } from "../src/intents/index.js";
import { B, MARKET, MemorySource, prdBook, Q } from "./fixtures.js";

/** In-memory model of the solver's intents.near and wallet balances plus the book's settlement. */
class FakeChain implements HedgeChain {
  intents = new Map<string, bigint>();
  wallet = new Map<string, bigint>();
  calls: string[] = [];
  swapMsg?: { market_id: number; side: string; legs: { base_amount: string }[] };
  get = (m: Map<string, bigint>, t: string) => m.get(t) ?? 0n;
  async intentsBalance(t: string) { return this.get(this.intents, t); }
  async walletBalance(t: string) { return this.get(this.wallet, t); }
  async withdraw(t: string, a: bigint) {
    this.calls.push(`withdraw ${t} ${a}`);
    this.intents.set(t, this.get(this.intents, t) - a);
    this.wallet.set(t, this.get(this.wallet, t) + a);
  }
  async bookSwap(t: string, args: { amount: string; msg: string }) {
    this.calls.push(`swap ${t}`);
    this.swapMsg = JSON.parse(args.msg);
    // Settle exactly the quoted legs; refund the unused headroom.
    const msg = this.swapMsg!;
    const base = msg.legs.reduce((s, l) => s + BigInt(l.base_amount), 0n);
    this.wallet.set(t, this.get(this.wallet, t) - BigInt(args.amount));
    if (msg.side === "buy_base") {
      const spent = this.spent!;
      this.wallet.set(MARKET.quote, this.get(this.wallet, MARKET.quote) + BigInt(args.amount) - spent);
      this.wallet.set(MARKET.base, this.get(this.wallet, MARKET.base) + base);
    } else {
      this.wallet.set(MARKET.quote, this.get(this.wallet, MARKET.quote) + this.proceeds!);
    }
  }
  spent?: bigint;
  proceeds?: bigint;
  async deposit(t: string, a: bigint) {
    this.calls.push(`deposit ${t} ${a}`);
    this.wallet.set(t, this.get(this.wallet, t) - a);
    this.intents.set(t, this.get(this.intents, t) + a);
  }
}

function setup() {
  const chain = new FakeChain();
  chain.intents.set(MARKET.base, B("50"));
  chain.intents.set(MARKET.quote, Q("1000"));
  const source = new MemorySource(prdBook());
  const r = new Rebalancer({ source, chain, marketId: 0, log: () => {} });
  return { chain, source, r };
}

describe("Rebalancer", () => {
  it("does nothing while inventory is at baseline", async () => {
    const { r } = setup();
    await r.init();
    expect(await r.rebalance()).toEqual({ hedged: false, reason: "in_balance" });
  });

  it("buys base back on the book after users bought base from the solver", async () => {
    const { r, chain } = setup();
    await r.init();
    // A user bought 10 wNEAR for 50.6 USDC through Intents.
    chain.intents.set(MARKET.base, B("40"));
    chain.intents.set(MARKET.quote, Q("1050.6"));
    chain.spent = Q("50.6"); // what the book will charge for 10 wNEAR (Arjun's $5.06 vs Priya's curve)
    const res = await r.rebalance();
    expect(res).toMatchObject({ hedged: true, side: "buy_base", base: B("10") });
    expect(chain.calls[0]).toMatch(/^withdraw usdc\.testnet/);
    expect(chain.calls[1]).toBe("swap usdc.testnet");
    expect(chain.calls.slice(2).every((c) => c.startsWith("deposit"))).toBe(true);
    // Everything that left was deposited back: base restored, all wallet funds returned.
    expect(await chain.intentsBalance(MARKET.base)).toBe(B("50"));
    expect(await chain.walletBalance(MARKET.quote)).toBe(0n);
    expect(await chain.walletBalance(MARKET.base)).toBe(0n);
  });

  it("sells base into the bids after users sold base to the solver", async () => {
    const { r, chain } = setup();
    await r.init();
    chain.intents.set(MARKET.base, B("52"));
    chain.intents.set(MARKET.quote, Q("990"));
    chain.proceeds = Q("9.9");
    const res = await r.rebalance();
    expect(res).toMatchObject({ hedged: true, side: "sell_base", base: B("2") });
    expect(chain.calls[0]).toBe(`withdraw wrap.testnet ${B("2")}`);
    expect(await chain.intentsBalance(MARKET.base)).toBe(B("50"));
    expect(await chain.intentsBalance(MARKET.quote)).toBe(Q("990") + Q("9.9"));
  });

  it("will not spend quote it does not have", async () => {
    const { r, chain } = setup();
    await r.init();
    chain.intents.set(MARKET.base, B("40")); // short base but no quote surplus
    expect(await r.rebalance()).toEqual({ hedged: false, reason: "no_quote_to_spend" });
    expect(chain.calls).toEqual([]);
  });

  it("skips dust below minBase and refuses to run twice at once", async () => {
    const { chain, source } = setup();
    const r = new Rebalancer({ source, chain, marketId: 0, minBase: B("1"), log: () => {} });
    await r.init();
    chain.intents.set(MARKET.base, B("50") + 1n);
    expect(await r.rebalance()).toEqual({ hedged: false, reason: "in_balance" });
  });
});

describe("NonceSource", () => {
  it("prefixes the current salt to 28 random bytes and caches the salt", async () => {
    let calls = 0;
    const n = new NonceSource({ view: (async () => { calls++; return "252812b3"; }) as never });
    const a = await n.next();
    const b = await n.next();
    expect(a).toHaveLength(32);
    expect(a.subarray(0, 4).toString("hex")).toBe("252812b3");
    expect(a.equals(b)).toBe(false);
    expect(calls).toBe(1);
  });

  it("rejects a malformed salt", async () => {
    await expect(new NonceSource({ view: (async () => "zz") as never }).next()).rejects.toThrow(/current_salt/);
  });
});
