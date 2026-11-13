import { askFill, bidCapacity, bidFill, newSide, type Side } from "@ebbflow/curve-math";
import { describe, expect, it } from "vitest";
import { buildQuote } from "../src/quote.js";
import { RouteError, routeBuyWithQuote, routeExactBase } from "../src/router.js";
import { B, MARKET, P, position, prdBook, Q } from "./fixtures.js";

const UNIT = 10n ** 24n;
const near = (x: bigint, y: bigint, tol: bigint) => (x > y ? x - y : y - x) <= tol;

describe("PRD worked example (TST-U10 via solver)", () => {
  const route = routeExactBase(prdBook(), MARKET, "buy_base", B("200"));

  it("splits across Priya and Arjun at a common marginal price of $5.06", () => {
    expect(route.legs.map((l) => l.owner_id)).toEqual(["priya.testnet", "arjun.testnet"]);
    expect(near(route.legs[0]!.base, B("141.421356"), B("0.001"))).toBe(true);
    expect(route.base_total).toBe(B("200"));
    expect(near(route.quote_total, Q("1010.111"), Q("0.01"))).toBe(true);
  });

  it("builds a signable transaction with slippage headroom", () => {
    const q = buildQuote(route, MARKET, "book.testnet", 50);
    expect(q.tx.receiver_id).toBe("usdc.testnet");
    expect(q.tx.args.receiver_id).toBe("book.testnet");
    expect(BigInt(q.tx.args.amount)).toBe((route.quote_total * 10_050n + 9_999n) / 10_000n);
    const msg = JSON.parse(q.tx.args.msg);
    expect(msg.action).toBe("swap");
    expect(msg.min_amount_out).toBe(B("200").toString());
    expect(msg.legs).toHaveLength(2);
    expect(q.amount_in_max.startsWith("1015.1")).toBe(true);
    expect(q.best_price).toBe("5.04");
    expect(q.price_impact_bps).toBeGreaterThan(0);
  });
});

describe("routing", () => {
  it("fills a small buy from the single best position", () => {
    const r = routeExactBase(prdBook(), MARKET, "buy_base", B("10"));
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]!.owner_id).toBe("priya.testnet");
  });

  it("routes sells into bids", () => {
    const r = routeExactBase(prdBook(), MARKET, "sell_base", B("100"));
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]!.owner_id).toBe("priya.testnet");
    const q = buildQuote(r, MARKET, "book.testnet", 50);
    expect(q.tx.receiver_id).toBe("wrap.testnet");
    expect(q.tx.args.amount).toBe(B("100").toString());
    expect(BigInt(q.min_amount_out_raw)).toBe((r.quote_total * 9_950n) / 10_000n);
  });

  it("rejects sizes beyond book liquidity with the available amount", () => {
    try {
      routeExactBase(prdBook(), MARKET, "buy_base", B("501"));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RouteError);
      expect((e as RouteError).available).toBe(B("500"));
    }
  });

  it("excludes the taker's own positions", () => {
    const r = routeExactBase(prdBook(), MARKET, "buy_base", B("50"), { excludeOwner: "priya.testnet" });
    expect(r.legs.map((l) => l.owner_id)).toEqual(["arjun.testnet"]);
  });

  // TST-S3
  it("caps routes at 8 legs", () => {
    const book = Array.from({ length: 12 }, (_, i) =>
      position(`m${i}.testnet`, newSide(B("10"), P(`5.0${i % 10}`), P(`5.0${i % 10}`), 0)),
    );
    const r = routeExactBase(book, MARKET, "buy_base", B("75"));
    expect(r.legs.length).toBeLessThanOrEqual(8);
    expect(r.base_total).toBe(B("75"));
    expect(() => routeExactBase(book, MARKET, "buy_base", B("85"))).toThrow(/more than 8/);
  });

  it("fills a limit order exactly, leaving no dust", () => {
    // Regression: float allocation used to strand 2^24 atomic units in fully used limit orders.
    const book = prdBook();
    const r = routeExactBase(book, MARKET, "buy_base", B("250"));
    const arjun = r.legs.find((l) => l.owner_id === "arjun.testnet")!;
    expect(arjun.base).toBe(B("100"));
    expect(r.base_total).toBe(B("250"));
  });

  it("ignores dust positions", () => {
    const book = [...prdBook(), position("dust.testnet", newSide(16_777_216n, P("5.00"), P("5.00"), 0))];
    const r = routeExactBase(book, MARKET, "buy_base", B("1"));
    expect(r.legs.map((l) => l.owner_id)).toEqual(["priya.testnet"]);
  });

  it("spends at most a quote budget (exact-in)", () => {
    const r = routeBuyWithQuote(prdBook(), MARKET, Q("1010.12"));
    expect(r.quote_total <= Q("1010.12")).toBe(true);
    expect(near(r.base_total, B("200"), B("0.01"))).toBe(true);
  });

  it("every leg is priced exactly as the contract would", () => {
    const r = routeExactBase(prdBook(), MARKET, "buy_base", B("333.3"));
    const book = prdBook();
    for (const leg of r.legs) {
      const p = book.find((x) => x.owner_id === leg.owner_id)!;
      const s = { ...p.ask!, remaining: BigInt(p.ask!.remaining), start_price: BigInt(p.ask!.start_price), current_price: BigInt(p.ask!.current_price), end_price: BigInt(p.ask!.end_price) };
      expect(askFill(s, UNIT, leg.base).quote).toBe(leg.quote);
    }
  });
});

// TST-S2: router optimality vs brute force on small books.
describe("optimality vs brute force", () => {
  function rng(seed: number) {
    return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  }

  function cost(sides: Side[], alloc: bigint[], buy: boolean): bigint | null {
    let total = 0n;
    for (let i = 0; i < sides.length; i++) {
      const a = alloc[i]!;
      if (a === 0n) continue;
      try {
        total += buy ? askFill(sides[i]!, UNIT, a).quote : bidFill(sides[i]!, UNIT, a).quote;
      } catch {
        return null;
      }
    }
    return total;
  }

  for (const buy of [true, false]) {
    it(`${buy ? "buy" : "sell"} routes are within 0.01% of the best grid split`, () => {
      const r = rng(buy ? 7 : 11);
      for (let trial = 0; trial < 25; trial++) {
        const sides: Side[] = [0, 1, 2].map(() => {
          const alpha = Math.floor(r() * 4);
          const p0 = 400 + Math.floor(r() * 200);
          const span = Math.floor(r() * 100);
          return buy
            ? newSide(B(String(50 + Math.floor(r() * 200))), P(String(p0 / 100)), P(String((p0 + span) / 100)), alpha)
            : newSide(Q(String(500 + Math.floor(r() * 2000))), P(String(p0 / 100)), P(String(Math.max(1, p0 - span) / 100)), alpha);
        });
        const book = sides.map((s, i) => position(`m${i}.testnet`, buy ? s : undefined, buy ? undefined : s));
        const caps = sides.map((s) => (buy ? s.remaining : bidCapacity(s, UNIT)));
        const capTotal = caps.reduce((a, b) => a + b, 0n);
        const size = (capTotal * BigInt(20 + Math.floor(r() * 60))) / 100n;

        const routed = routeExactBase(book, MARKET, buy ? "buy_base" : "sell_base", size);
        expect(routed.base_total).toBe(size);

        const steps = 60n;
        let best: bigint | null = null;
        for (let i = 0n; i <= steps; i++) {
          for (let j = 0n; i + j <= steps; j++) {
            const a0 = (size * i) / steps;
            const a1 = (size * j) / steps;
            const alloc = [a0, a1, size - a0 - a1];
            if (alloc.some((a, k) => a > caps[k]!)) continue;
            const c = cost(sides, alloc, buy);
            if (c === null) continue;
            if (best === null || (buy ? c < best : c > best)) best = c;
          }
        }
        expect(best).not.toBeNull();
        const tol = best! / 10_000n + 10n;
        if (buy) expect(routed.quote_total <= best! + tol).toBe(true);
        else expect(routed.quote_total >= best! - tol).toBe(true);
      }
    });
  }
});
