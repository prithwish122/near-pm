/** Market-maker client for the NEAR Intents solver relay (JSON-RPC over WebSocket). */
import WebSocket from "ws";
import { decide, subscribedAssets, type IntentsQuoteRequest, type QuoterConfig } from "./quoter.js";
import { signTokenDiff, type Signer } from "./nep413.js";
import type { BookSource } from "../types.js";

export const RELAY_WS_URL = "wss://solver-relay-v2.chaindefuser.com/ws";

export interface BusOptions {
  url?: string;
  /** Partner-portal JWT, sent as `Authorization: Bearer`. */
  token?: string;
  source: BookSource;
  quoter: QuoterConfig;
  /** Without a signer the bus only logs what it would quote (dry run). */
  signer?: Signer;
  /** Extra time added to the request's min_deadline_ms for the intent's deadline. */
  deadlineSlackMs?: number;
  log?: (msg: string, data?: unknown) => void;
  reconnectMs?: number;
  /** Nonce for each signed intent (salt-prefixed in production, see NonceSource). */
  nonce?: () => Promise<Uint8Array>;
  /** Solver's balance of an Intents asset id; quotes the solver cannot cover are skipped. */
  inventory?: (assetId: string) => Promise<bigint>;
  /** Called after a quote_status event (a quote was selected and settled). */
  onSettled?: () => void;
}

export class SolverBus {
  private ws?: WebSocket;
  private stopped = false;
  private nextId = 1;
  private timer?: NodeJS.Timeout;
  readonly stats = { requests: 0, quoted: 0, skipped: 0, settled: 0 };

  constructor(private readonly o: BusOptions) {}

  private log(msg: string, data?: unknown) {
    (this.o.log ?? ((m, d) => console.log(`[intents] ${m}`, d ?? "")))(msg, data);
  }

  async start(): Promise<void> {
    this.stopped = false;
    const assets = await subscribedAssets(this.o.source, this.o.quoter);
    const ws = new WebSocket(this.o.url ?? RELAY_WS_URL, {
      headers: this.o.token ? { Authorization: `Bearer ${this.o.token}` } : {},
    });
    this.ws = ws;
    ws.on("open", () => {
      this.log(`connected, subscribing for ${assets.join(", ")}`);
      this.send({ method: "subscribe", params: ["quote", { tokens_in: assets, tokens_out: assets }] });
      this.send({ method: "subscribe", params: ["quote_status"] });
    });
    ws.on("message", (raw) => {
      this.onMessage(raw.toString()).catch((e) => this.log(`handler error: ${(e as Error).message}`));
    });
    ws.on("error", (e) => this.log(`socket error: ${e.message}`));
    ws.on("close", () => {
      if (this.stopped) return;
      this.log("disconnected, reconnecting");
      this.timer = setTimeout(() => this.start().catch((e) => this.log(`reconnect failed: ${e.message}`)), this.o.reconnectMs ?? 2000);
    });
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

  private send(msg: Record<string, unknown>) {
    this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, ...msg }));
  }

  async onMessage(raw: string): Promise<void> {
    let m: { method?: string; params?: Record<string, unknown>; error?: unknown };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.error) this.log("relay error", m.error);
    const p = m.params;
    if (m.method !== "subscribe" || !p) return;
    if (typeof p.quote_id === "string") return this.onQuote(p as unknown as IntentsQuoteRequest);
    if (typeof p.quote_hash === "string") {
      this.stats.settled++;
      this.log("quote settled", { quote_hash: p.quote_hash, intent_hash: p.intent_hash, tx_hash: p.tx_hash });
      this.o.onSettled?.();
    }
  }

  private async onQuote(req: IntentsQuoteRequest): Promise<void> {
    this.stats.requests++;
    const d = await decide(this.o.source, this.o.quoter, req);
    if (!d.ok) {
      this.stats.skipped++;
      this.log(`skip ${req.quote_id}: ${d.reason}`);
      return;
    }
    const summary = {
      quote_id: req.quote_id,
      side: d.side,
      in: `${req.defuse_asset_identifier_in} ${d.amountIn}`,
      out: `${req.defuse_asset_identifier_out} ${d.amountOut}`,
      legs: d.route.legs.length,
    };
    if (!this.o.signer) {
      this.stats.quoted++;
      this.log("dry-run quote (no signer, not sent)", summary);
      return;
    }
    if (this.o.inventory) {
      const have = await this.o.inventory(req.defuse_asset_identifier_out);
      if (have < d.amountOut) {
        this.stats.skipped++;
        this.log(`skip ${req.quote_id}: insufficient_inventory`, { have: have.toString(), need: d.amountOut.toString() });
        return;
      }
    }
    const nonce = this.o.nonce ? await this.o.nonce() : undefined;
    const deadline = new Date(Date.now() + (req.min_deadline_ms ?? 60_000) + (this.o.deadlineSlackMs ?? 30_000));
    const signed = signTokenDiff(this.o.signer, {
      assetIn: req.defuse_asset_identifier_in,
      amountIn: d.amountIn,
      assetOut: req.defuse_asset_identifier_out,
      amountOut: d.amountOut,
      deadline,
      nonce,
    });
    // The bus asks for the side the request left open.
    const quote_output = req.exact_amount_in !== undefined ? { amount_out: d.amountOut.toString() } : { amount_in: d.amountIn.toString() };
    this.send({ method: "quote_response", params: [{ quote_id: req.quote_id, quote_output, signed_data: signed }] });
    this.stats.quoted++;
    this.log("quoted", summary);
  }
}
