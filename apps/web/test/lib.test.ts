import { describe, expect, it } from "vitest";
import { MARKET } from "../lib/config";
import { fmtUnits, parseAmount, shortAccount, timeAgo } from "../lib/format";
import { parseSide, previewSide, type SideForm } from "../lib/curvePreview";
import { closePositionTx, createPositionTx, depositTx, mintTx, swapTx, unwrapNearTx, withdrawTx } from "../lib/tx";
import { describeOutcome, failureReason, hasFailure, parseEvents } from "../lib/txResult";

const book = "book.t.testnet";
const ev = (event: string, data: object) => `EVENT_JSON:${JSON.stringify({ standard: "ebbflow", version: "1.0.0", event, data: [data] })}`;
const outcome = (logs: string[], status: unknown = { SuccessValue: "" }) => ({ status, receipts_outcome: [{ outcome: { logs, status: { SuccessValue: "" } } }] });

describe("tx builders", () => {
  it("deposit sends ft_transfer_call with a deposit msg and 1 yocto", () => {
    const t = depositTx("tok.testnet", book, 5n);
    expect(t.receiverId).toBe("tok.testnet");
    expect(t.calls[0]!.method).toBe("ft_transfer_call");
    expect(t.calls[0]!.deposit).toBe("1");
    expect(t.calls[0]!.args).toEqual({ receiver_id: book, amount: "5", msg: '{"action":"deposit"}' });
  });
  it("create_position attaches the 0.01 NEAR storage deposit and passes null for a missing side", () => {
    const t = createPositionTx(book, 0, { amount: "1", start_price: "2", end_price: "3", alpha: 1 }, null);
    expect(t.calls[0]!.deposit).toBe("10000000000000000000000");
    expect(t.calls[0]!.args).toMatchObject({ market_id: 0, bid: null });
  });
  it("withdraw: omitted amount is null (whole balance)", () => {
    expect(withdrawTx(book, "tok").calls[0]!.args).toEqual({ token_id: "tok", amount: null });
    expect(withdrawTx(book, "tok", 7n).calls[0]!.args).toEqual({ token_id: "tok", amount: "7" });
  });
  it("close_position takes 1 yocto", () => expect(closePositionTx(book, "3").calls[0]).toMatchObject({ method: "close_position", deposit: "1", args: { position_id: "3" } }));
  it("mint attaches nothing", () => expect(mintTx("t", 1n).calls[0]!.deposit).toBe("0"));
  it("swapTx passes the solver's ft_transfer_call through untouched", () => {
    const q = { receiver_id: "usdc", method_name: "ft_transfer_call" as const, args: { receiver_id: book, amount: "10", msg: "{}" }, gas: "150000000000000", deposit: "1" as const };
    expect(swapTx(q)).toEqual({ receiverId: "usdc", calls: [{ method: "ft_transfer_call", args: q.args, gas: q.gas, deposit: "1" }] });
  });
});

describe("outcome parsing", () => {
  it("reads ebbflow events and ignores other logs", () => {
    const e = parseEvents(outcome(["hello", "EVENT_JSON:not json", ev("deposit", { amount: "1" }), 'EVENT_JSON:{"standard":"nep141","event":"ft_transfer","data":[{}]}']));
    expect(e.map((x) => x.event)).toEqual(["deposit"]);
  });
  it("a swap is Filled with amounts, refund and leg count", () => {
    const d = describeOutcome(outcome([ev("swap", { side: "buy_base", amount_in: "1010110000", amount_out: "200000000000000000000000000", refund: "5060000", legs: [{}, {}] })]), MARKET);
    expect(d.tone).toBe("success");
    expect(d.title).toBe("Filled");
    expect(d.lines.join("|")).toContain("200 wNEAR");
    expect(d.lines.join("|")).toContain("Refunded 5.06 tUSDC");
    expect(d.lines.join("|")).toContain("2 makers");
  });
  it("swap_rejected is a Refunded state with a re-quote offer", () => {
    const d = describeOutcome(outcome([ev("swap_rejected", { reason: "E05_POSITION_NOT_FOUND", amount_refunded: "1" })]), MARKET);
    expect(d.tone).toBe("warn");
    expect(d.title).toMatch(/Refunded/);
    expect(d.requote).toBe(true);
    expect(d.lines[0]).toMatch(/route no longer valid/);
  });
  it("detects failures in the tx or any receipt", () => {
    expect(hasFailure(outcome([], { Failure: {} }))).toBe(true);
    expect(hasFailure({ status: {}, receipts_outcome: [{ outcome: { logs: [], status: { Failure: {} } } }] })).toBe(true);
    expect(describeOutcome(outcome([], { Failure: {} }), MARKET).tone).toBe("error");
  });
  it("titles rejected swaps by reason and skips re-quote when paused", () => {
    const paused = describeOutcome(outcome([ev("swap_rejected", { reason: "E13_PAUSED", amount_refunded: "1" })]), MARKET);
    expect(paused.title).toBe("Refunded: trading is paused");
    expect(paused.requote).toBe(false);
    const slip = describeOutcome(outcome([ev("swap_rejected", { reason: "E09_MIN_OUT_NOT_MET", amount_refunded: "1" })]), MARKET);
    expect(slip.title).toMatch(/slippage/);
  });
  it("says when swap output was credited inside the book", () => {
    const d = describeOutcome(
      outcome([
        ev("swap", { side: "buy_base", amount_in: "5040000", amount_out: "1000000000000000000000000", refund: "0", legs: [{}] }),
        ev("payout_credited", { account_id: "bob.testnet", token_id: MARKET.base, amount: "1000000000000000000000000" }),
      ]),
      MARKET,
    );
    expect(d.tone).toBe("warn");
    expect(d.lines[0]).toMatch(/credited to your book balance/);
    expect(d.lines.join("|")).toMatch(/withdraw it from Portfolio/);
  });
  it("extracts the contract panic reason from a failed receipt", () => {
    const failure = { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: E10_INSUFFICIENT_BALANCE" } } } } };
    const o = { status: failure, receipts_outcome: [{ outcome: { logs: [], status: failure } }] };
    expect(failureReason(o)).toBe("E10_INSUFFICIENT_BALANCE");
    const d = describeOutcome(o, MARKET);
    expect(d.tone).toBe("error");
    expect(d.lines[0]).toMatch(/book balance is too low/);
  });
  it("reports a withdrawal restored after a failed transfer", () => {
    const d = describeOutcome(outcome([ev("withdraw", { account_id: "a.testnet", token_id: MARKET.base, amount: "1" }), "withdraw failed; 1 restored to a.testnet"]), MARKET);
    expect(d.tone).toBe("warn");
    expect(d.title).toMatch(/returned to your book balance/);
  });
  it("builds an unwrap with 1 yocto", () => {
    const t = unwrapNearTx("wrap.testnet", 5n);
    expect(t.receiverId).toBe("wrap.testnet");
    expect(t.calls[0]).toMatchObject({ method: "near_withdraw", args: { amount: "5" }, deposit: "1" });
  });
  it("describes created and closed positions", () => {
    expect(describeOutcome(outcome([ev("position_created", { position_id: "9" })]), MARKET).title).toBe("Position #9 published");
    expect(describeOutcome(outcome([ev("position_closed", { position_id: "9", returned_base: "0", returned_quote: "0" })]), MARKET).title).toBe("Position #9 closed");
  });
});

describe("format", () => {
  it("formats and parses atomic amounts", () => {
    expect(fmtUnits(1_234_567_890n, 6, 2)).toBe("1,234.56");
    expect(parseAmount("1.5", 6)).toBe(1_500_000n);
    expect(parseAmount("1.1234567", 6)).toBeNull(); // too many decimals
    expect(parseAmount("", 6)).toBeNull();
    expect(parseAmount("abc", 6)).toBeNull();
  });
  it("keeps the distinguishing end of an account id", () => {
    expect(shortAccount("ebbflow-team-priya.testnet")).not.toBe(shortAccount("ebbflow-team-arjun.testnet"));
    expect(shortAccount("a.testnet")).toBe("a.testnet");
  });
  it("timeAgo", () => expect(timeAgo(0, 90_000)).toBe("1m ago"));
});

const form = (o: Partial<SideForm> = {}): SideForm => ({ on: true, amount: "400", start: "5.04", end: "5.20", limit: false, alpha: 1, ...o });

describe("Make validation mirrors the contract", () => {
  it("accepts the PRD ask", () => expect(parseSide("ask", form(), MARKET).side).not.toBeNull());
  it("ask end must be >= start", () => expect(parseSide("ask", form({ end: "5.00" }), MARKET).errors.end).toMatch(/≥ start/));
  it("bid end must be <= start", () => expect(parseSide("bid", form({ amount: "2000", start: "4.96", end: "5.00" }), MARKET).errors.end).toMatch(/≤ start/));
  it("rejects zero and invalid values", () => {
    expect(parseSide("ask", form({ amount: "0" }), MARKET).errors.amount).toMatch(/greater than 0/);
    expect(parseSide("ask", form({ start: "0" }), MARKET).errors.start).toMatch(/greater than 0/);
    expect(parseSide("ask", form({ start: "" }), MARKET).errors.start).toBeDefined();
  });
  it("a limit order ignores the end price and collapses the curve", () => {
    const p = parseSide("ask", form({ limit: true, end: "" }), MARKET);
    expect(p.side!.start_price).toBe(p.side!.end_price);
  });
});

describe("curve preview reproduces the PRD worked example (§7.8)", () => {
  it("Priya's ask slices at 25/50/75/100%", () => {
    const s = parseSide("ask", form(), MARKET).side!;
    const { slices } = previewSide("ask", s, MARKET);
    const by = Object.fromEntries(slices.map((x) => [x.pct, x]));
    expect(by[25]).toMatchObject({ marginal: "5.05", avg: "5.0433" });
    expect(by[50]).toMatchObject({ marginal: "5.08", avg: "5.0533" });
    expect(by[75]).toMatchObject({ marginal: "5.13", avg: "5.07" });
    expect(by[100]).toMatchObject({ marginal: "5.2", avg: "5.0933" });
  });
  it("a limit order previews as a vertical bar (constant price, growing size)", () => {
    const s = parseSide("ask", form({ limit: true, start: "5.06", amount: "100" }), MARKET).side!;
    const { pts } = previewSide("ask", s, MARKET);
    expect(new Set(pts.map((p) => p[0])).size).toBe(1);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(100, 6);
  });
});

import { DESTINATIONS, filterTokens, summarizeFundQuote } from "../lib/intents";

describe("intents funding helpers", () => {
  const tokens = [
    { assetId: "a", symbol: "USDC", blockchain: "near", decimals: 6 },
    { assetId: "b", symbol: "USDC", blockchain: "eth", decimals: 6 },
    { assetId: "c", symbol: "SOL", blockchain: "sol", decimals: 9 },
  ];
  it("filters by symbol or chain and puts NEAR-native assets last", () => {
    expect(filterTokens(tokens, "usdc").map((t) => t.blockchain)).toEqual(["eth", "near"]);
    expect(filterTokens(tokens, "sol")).toHaveLength(1);
    expect(filterTokens(tokens, "", 2)).toHaveLength(2);
  });
  it("summarises a quote, or returns null when fields are missing", () => {
    expect(summarizeFundQuote({ quote: { amountInFormatted: "10", amountOutFormatted: "4.1", timeEstimate: 120 } }, "USDC", "wNEAR")).toBe("Pay 10 USDC, receive about 4.1 wNEAR in about 2 min.");
    expect(summarizeFundQuote({}, "USDC", "wNEAR")).toBeNull();
  });
  it("offers wNEAR and USDC on NEAR", () => {
    expect(DESTINATIONS.map((d) => d.assetId)).toContain("nep141:wrap.near");
  });
});
