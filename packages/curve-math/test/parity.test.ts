// TST-S1: the TypeScript port matches the Rust contract maths exactly.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  askFill,
  bidCapacity,
  bidFill,
  CurveError,
  formatUnits,
  parsePrice,
  parseUnits,
  sideFromJson,
  type SideJson,
} from "../src/index.js";

interface Case {
  kind: "ask" | "bid";
  side: SideJson;
  base_unit: string;
  base: string;
  capacity?: string;
  result: { quote: string; new_price: string } | { error: string };
}

const cases: Case[] = JSON.parse(
  readFileSync(new URL("../fixtures/curve.json", import.meta.url), "utf8"),
);

function run(c: Case) {
  const s = sideFromJson(c.side);
  const unit = BigInt(c.base_unit);
  try {
    const f = c.kind === "ask" ? askFill(s, unit, BigInt(c.base)) : bidFill(s, unit, BigInt(c.base));
    return { quote: f.quote.toString(), new_price: f.new_price.toString() };
  } catch (e) {
    if (e instanceof CurveError) return { error: e.code };
    throw e;
  }
}

describe("curve-math parity with Rust", () => {
  it("has fixtures", () => expect(cases.length).toBeGreaterThan(100));

  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    expect(run(c)).toEqual(c.result);
    if (c.capacity !== undefined) {
      expect(bidCapacity(sideFromJson(c.side), BigInt(c.base_unit)).toString()).toBe(c.capacity);
    }
  });
});

describe("unit helpers", () => {
  it("parses and formats", () => {
    expect(parseUnits("200", 24)).toBe(200n * 10n ** 24n);
    expect(parseUnits("1.5", 6)).toBe(1_500_000n);
    expect(parsePrice("5.04", 6)).toBe(5_040_000n * 10n ** 12n);
    expect(formatUnits(1_010_111_000n, 6, 2)).toBe("1010.11");
    expect(() => parseUnits("1.0000001", 6)).toThrow();
    expect(() => parseUnits("abc", 6)).toThrow();
  });
});
