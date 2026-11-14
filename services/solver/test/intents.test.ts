import { createPublicKey, randomBytes, verify } from "node:crypto";
import { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { base58Decode, base58Encode, decide, nep413Digest, signerFromSecretKey, signTokenDiff, SolverBus, OneClick } from "../src/intents/index.js";
import { createApp } from "../src/server.js";
import { MARKET, MemorySource, prdBook, Q } from "./fixtures.js";

const BASE = `nep141:${MARKET.base}`;
const QUOTE = `nep141:${MARKET.quote}`;
const cfg = { marginBps: 30, maxQuoteRaw: Q("100000") };

// Deterministic test key (never used outside tests).
const seed = Buffer.alloc(32, 7);
const secret = `ed25519:${base58Encode(seed)}`;

describe("base58", () => {
  it("round-trips including leading zeros", () => {
    for (const b of [Uint8Array.from([0, 0, 1, 2, 255]), randomBytes(32), Uint8Array.from([])]) {
      expect(Array.from(base58Decode(base58Encode(b)))).toEqual(Array.from(b));
    }
    expect(base58Encode(Buffer.from("hello"))).toBe("Cn8eVZg");
  });
});

describe("NEP-413 signing", () => {
  it("signs the documented digest and the signature verifies", () => {
    const signer = signerFromSecretKey("solver.near", secret);
    const deadline = new Date("2030-01-01T00:00:00.000Z");
    const nonce = Buffer.alloc(32, 1);
    const s = signTokenDiff(signer, { assetIn: QUOTE, amountIn: 500n, assetOut: BASE, amountOut: 300n, deadline, nonce });
    expect(s.standard).toBe("nep413");
    expect(s.payload.recipient).toBe("intents.near");
    expect(JSON.parse(s.payload.message)).toEqual({
      signer_id: "solver.near",
      deadline: "2030-01-01T00:00:00.000Z",
      intents: [{ intent: "token_diff", diff: { [QUOTE]: "500", [BASE]: "-300" } }],
    });
    const digest = nep413Digest(s.payload.message, nonce, "intents.near");
    const pub = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(base58Decode(s.public_key.slice(8))).toString("base64url") },
      format: "jwk",
    });
    expect(verify(null, digest, pub, Buffer.from(base58Decode(s.signature.slice(8))))).toBe(true);
    // A different message must not verify.
    expect(verify(null, nep413Digest(s.payload.message + " ", nonce, "intents.near"), pub, Buffer.from(base58Decode(s.signature.slice(8))))).toBe(false);
  });

  it("derives the right public key from a 64-byte secret", () => {
    const a = signerFromSecretKey("a.near", secret);
    const full = Buffer.concat([seed, Buffer.from(base58Decode(a.publicKey.slice(8)))]);
    expect(signerFromSecretKey("a.near", `ed25519:${base58Encode(full)}`).publicKey).toBe(a.publicKey);
  });

  it("rejects bad keys and amounts", () => {
    expect(() => signerFromSecretKey("a.near", "secp256k1:abc")).toThrow();
    const signer = signerFromSecretKey("a.near", secret);
    expect(() => signTokenDiff(signer, { assetIn: QUOTE, amountIn: 0n, assetOut: BASE, amountOut: 1n, deadline: new Date() })).toThrow();
  });
});

describe("quoter", () => {
  const source = new MemorySource(prdBook());

  it("exact-in quote token buys base, keeping the margin", async () => {
    const d = await decide(source, cfg, { quote_id: "q", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, exact_amount_in: Q("1010").toString() });
    if (!d.ok) throw new Error(d.reason);
    expect(d.side).toBe("buy_base");
    expect(d.amountIn).toBe(Q("1010"));
    // Spends at most 99.7% of the input on the book, so the route cost is below the budget.
    expect(d.route.quote_total).toBeLessThanOrEqual((Q("1010") * 9970n) / 10000n);
    expect(d.amountOut).toBe(d.route.base_total);
  });

  it("exact-out base quote adds the margin on top of the route cost", async () => {
    const d = await decide(source, cfg, { quote_id: "q", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, exact_amount_out: (200n * 10n ** 24n).toString() });
    if (!d.ok) throw new Error(d.reason);
    expect(d.amountOut).toBe(200n * 10n ** 24n);
    expect(d.amountIn).toBeGreaterThan(d.route.quote_total);
    expect(d.amountIn).toBeLessThanOrEqual((d.route.quote_total * 10_030n) / 10_000n + 1n);
  });

  it("exact-in base sells into the bids and pays below the route", async () => {
    const d = await decide(source, cfg, { quote_id: "q", defuse_asset_identifier_in: BASE, defuse_asset_identifier_out: QUOTE, exact_amount_in: (10n ** 24n).toString() });
    if (!d.ok) throw new Error(d.reason);
    expect(d.side).toBe("sell_base");
    expect(d.amountOut).toBeLessThan(d.route.quote_total);
  });

  it("declines what it cannot or should not quote", async () => {
    const r = (o: object) => decide(source, cfg, { quote_id: "q", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, ...o });
    expect(await r({ defuse_asset_identifier_out: "nep141:other.near", exact_amount_in: "1000000" })).toEqual({ ok: false, reason: "unsupported_pair" });
    expect(await r({})).toEqual({ ok: false, reason: "need_exactly_one_exact_amount" });
    expect(await r({ exact_amount_in: "1", exact_amount_out: "1" })).toEqual({ ok: false, reason: "need_exactly_one_exact_amount" });
    expect(await r({ exact_amount_in: "0" })).toEqual({ ok: false, reason: "bad_amount" });
    expect(await r({ exact_amount_out: (10_000n * 10n ** 24n).toString() })).toEqual({ ok: false, reason: "insufficient_liquidity" });
    expect(
      await decide(source, { ...cfg, maxQuoteRaw: Q("1000") }, { quote_id: "q", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, exact_amount_in: Q("1500").toString() }),
    ).toEqual({ ok: false, reason: "above_size_cap" });
    expect(
      await decide(source, cfg, { quote_id: "q", defuse_asset_identifier_in: BASE, defuse_asset_identifier_out: QUOTE, exact_amount_out: "1000000" }),
    ).toEqual({ ok: false, reason: "exact_out_sell_unsupported" });
  });

  it("honours a custom asset id mapping (mainnet ids)", async () => {
    const mapped = { ...cfg, assetId: (t: string) => (t === MARKET.base ? "nep141:wrap.near" : "nep141:usdc-mainnet") };
    const d = await decide(source, mapped, { quote_id: "q", defuse_asset_identifier_in: "nep141:usdc-mainnet", defuse_asset_identifier_out: "nep141:wrap.near", exact_amount_in: Q("100").toString() });
    expect(d.ok).toBe(true);
  });
});

describe("solver bus (mock relay)", () => {
  async function relay() {
    const wss = new WebSocketServer({ port: 0 });
    const url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
    const received: any[] = [];
    let headers: Record<string, unknown> = {};
    wss.on("connection", (sock, req) => {
      headers = req.headers;
      sock.on("message", (m) => received.push(JSON.parse(m.toString())));
    });
    const clientReady = new Promise<import("ws").WebSocket>((res) => wss.on("connection", res));
    return { wss, url, received, getHeaders: () => headers, clientReady };
  }
  const until = async (f: () => boolean) => {
    for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(f()).toBe(true);
  };

  it("subscribes, answers a quote with a signed token_diff, and logs settlement", async () => {
    const r = await relay();
    const logs: string[] = [];
    const bus = new SolverBus({ url: r.url, token: "jwt-123", source: new MemorySource(prdBook()), quoter: cfg, signer: signerFromSecretKey("solver.near", secret), log: (m) => logs.push(m) });
    await bus.start();
    const sock = await r.clientReady;
    await until(() => r.received.length >= 2);
    expect(r.getHeaders().authorization).toBe("Bearer jwt-123");
    expect(r.received[0]).toMatchObject({ method: "subscribe", params: ["quote", { tokens_in: expect.arrayContaining([BASE, QUOTE]) }] });
    expect(r.received[1]).toMatchObject({ method: "subscribe", params: ["quote_status"] });

    sock.send(JSON.stringify({ jsonrpc: "2.0", method: "subscribe", params: { subscription: "s", quote_id: "q-1", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, exact_amount_in: Q("500").toString(), min_deadline_ms: 60000 } }));
    await until(() => r.received.some((m) => m.method === "quote_response"));
    const resp = r.received.find((m) => m.method === "quote_response").params[0];
    expect(resp.quote_id).toBe("q-1");
    const diff = JSON.parse(resp.signed_data.payload.message).intents[0].diff;
    expect(BigInt(diff[QUOTE])).toBe(Q("500"));
    expect(-BigInt(diff[BASE])).toBe(BigInt(resp.quote_output.amount_out));
    expect(resp.signed_data.public_key).toMatch(/^ed25519:/);

    sock.send(JSON.stringify({ jsonrpc: "2.0", method: "subscribe", params: { quote_hash: "h", intent_hash: "i", tx_hash: "t" } }));
    await until(() => bus.stats.settled === 1);
    expect(bus.stats).toMatchObject({ requests: 1, quoted: 1, skipped: 0 });
    bus.stop();
    r.wss.close();
  });

  it("replies with amount_in for exact-out requests and skips unsupported ones", async () => {
    const r = await relay();
    const bus = new SolverBus({ url: r.url, source: new MemorySource(prdBook()), quoter: cfg, signer: signerFromSecretKey("solver.near", secret), log: () => {} });
    await bus.start();
    const sock = await r.clientReady;
    await until(() => r.received.length >= 2);
    sock.send(JSON.stringify({ method: "subscribe", params: { quote_id: "q-2", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, exact_amount_out: (10n ** 24n).toString() } }));
    sock.send(JSON.stringify({ method: "subscribe", params: { quote_id: "q-3", defuse_asset_identifier_in: "nep141:x", defuse_asset_identifier_out: BASE, exact_amount_in: "1" } }));
    await until(() => bus.stats.requests === 2);
    const responses = r.received.filter((m) => m.method === "quote_response");
    expect(responses).toHaveLength(1);
    expect(responses[0].params[0].quote_output.amount_in).toMatch(/^\d+$/);
    expect(bus.stats.skipped).toBe(1);
    bus.stop();
    r.wss.close();
  });

  it("is a dry run without a signer: nothing is sent", async () => {
    const r = await relay();
    const bus = new SolverBus({ url: r.url, source: new MemorySource(prdBook()), quoter: cfg, log: () => {} });
    await bus.start();
    const sock = await r.clientReady;
    await until(() => r.received.length >= 2);
    sock.send(JSON.stringify({ method: "subscribe", params: { quote_id: "q-4", defuse_asset_identifier_in: QUOTE, defuse_asset_identifier_out: BASE, exact_amount_in: Q("50").toString() } }));
    await until(() => bus.stats.quoted === 1);
    expect(r.received.some((m) => m.method === "quote_response")).toBe(false);
    bus.stop();
    r.wss.close();
  });
});

describe("1Click proxy endpoints", () => {
  const fake = (calls: { url: string; init?: RequestInit }[]): typeof fetch =>
    (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify([{ assetId: "nep141:wrap.near", symbol: "wNEAR", blockchain: "near", decimals: 24 }]), { status: 200 });
      if (url.endsWith("/v0/quote")) return new Response(JSON.stringify({ quote: { depositAddress: "abc", amountOut: "1" } }), { status: 200 });
      return new Response("nope", { status: 401 });
    }) as unknown as typeof fetch;
  const body = { origin_asset: "nep141:eth-usdc.omft.near", destination_asset: "nep141:wrap.near", amount: "1000000", recipient: "me.near", refund_to: "0xabc" };

  it("lists tokens and reports whether quoting is enabled", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const a = createApp(new MemorySource(prdBook()), new OneClick("key", "https://oc.test", fake(calls)));
    expect(await (await a.request("/intents/tokens")).json()).toMatchObject({ enabled: true, dry_quotes: true, tokens: [{ symbol: "wNEAR" }] });
  });

  it("sends the exact-input request with the server-side api key", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const a = createApp(new MemorySource(prdBook()), new OneClick("secret-key", "https://oc.test", fake(calls)));
    const res = await a.request("/intents/swap-quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const sent = calls.find((c) => c.url.endsWith("/v0/quote"))!;
    expect((sent.init!.headers as Record<string, string>)["x-api-key"]).toBe("secret-key");
    expect(JSON.parse(sent.init!.body as string)).toMatchObject({ dry: true, swapType: "EXACT_INPUT", originAsset: body.origin_asset, destinationAsset: body.destination_asset, amount: "1000000", recipient: "me.near", refundTo: "0xabc" });
  });

  it("serves dry quotes without a key, but needs one for a deposit address or status", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const nokey = createApp(new MemorySource(prdBook()), new OneClick(undefined, "https://oc.test", fake(calls)));
    const post = (b: object) => nokey.request("/intents/swap-quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await post(body)).status).toBe(200);
    expect(((calls.find((c) => c.url.endsWith("/v0/quote"))!.init!.headers ?? {}) as Record<string, string>)["x-api-key"]).toBeUndefined();
    expect((await post({ ...body, dry: false })).status).toBe(503);
    expect((await nokey.request("/intents/status?deposit_address=abc")).status).toBe(503);
    expect(await (await nokey.request("/intents/tokens")).json()).toMatchObject({ enabled: false, dry_quotes: true });
  });

  it("returns 503 when no api key is configured and 502 on upstream errors", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const nokey = createApp(new MemorySource(prdBook()), new OneClick(undefined, "https://oc.test", fake(calls)));
    const post = (a: ReturnType<typeof createApp>, b: object = body) => a.request("/intents/swap-quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await post(nokey, { ...body, dry: false })).status).toBe(503);
    const bad = createApp(new MemorySource(prdBook()), new OneClick("k", "https://oc.test", (async () => new Response("denied", { status: 401 })) as unknown as typeof fetch));
    expect((await post(bad)).status).toBe(502);
  });
});
