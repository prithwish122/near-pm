import { describe, expect, it } from "vitest";
import { askFill, bidFill } from "@ebbflow/curve-math";
import { arjunAsk, askStep, B, bidStep, priyaAsk, priyaBid, recycle, route, UNIT } from "../lib/docs/calc";
import { ALL_PAGES } from "../lib/docs/nav";

describe("docs worked examples", () => {
  it("prices the 100 wNEAR buy exactly as curve-math does", () => {
    expect(askStep.quote).toBe(askFill(priyaAsk(), UNIT, B("100")).quote);
    expect(askStep.quote).toBe(504_333_334n);
    expect(askStep.newPrice).toBe(5_050_000_000_000_000_000n);
  });
  it("routes 200 wNEAR to a common marginal price of $5.06", () => {
    expect(route.priyaBase + route.arjunBase).toBe(B("200"));
    // The price step rounds up, so Priya lands on $5.06 plus at most one raw unit (10⁻¹⁸ of a dollar).
    expect(route.priya.new_price - arjunAsk().start_price <= 1n).toBe(true);
    expect(route.total).toBe(1_010_114_383n);
    expect(route.saving > 0n).toBe(true);
  });
  it("bid example and recycling are consistent", () => {
    expect(bidStep.quote).toBe(bidFill(priyaBid(), UNIT, B("100")).quote);
    expect(recycle.capAfter > recycle.capBefore).toBe(true);
    expect(recycle.spread).toBe(askStep.quote - recycle.sell.quote);
  });
});

describe("docs navigation", () => {
  it("has unique slugs", () => {
    expect(new Set(ALL_PAGES.map((p) => p.slug)).size).toBe(ALL_PAGES.length);
  });
});
