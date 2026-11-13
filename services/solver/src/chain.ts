import type { BookSource, Market, PositionView, SimulateView, SwapMsg } from "./types.js";

export class RpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcError";
  }
}

/** Minimal NEAR JSON-RPC client with endpoint failover. View calls are free. */
export class NearRpc {
  constructor(
    private readonly urls: string[],
    private readonly timeoutMs = 8_000,
  ) {
    if (urls.length === 0) throw new Error("at least one RPC url is required");
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (const url of this.urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "ebbflow", method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new RpcError(`${url}: HTTP ${res.status}`);
        const body = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown } };
        if (body.error) throw new RpcError(`${url}: ${body.error.message ?? "error"} ${JSON.stringify(body.error.data ?? "")}`);
        return body.result as T;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new RpcError(String(lastError));
  }

  async view<T>(accountId: string, methodName: string, args: unknown = {}): Promise<T> {
    const result = await this.request<{ result?: number[]; error?: string }>("query", {
      request_type: "call_function",
      finality: "optimistic",
      account_id: accountId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    });
    if (result.error || !result.result) throw new RpcError(`${accountId}.${methodName}: ${result.error ?? "no result"}`);
    return JSON.parse(Buffer.from(result.result).toString("utf8")) as T;
  }

  async blockHeight(): Promise<number> {
    const block = await this.request<{ header: { height: number } }>("block", { finality: "final" });
    return block.header.height;
  }
}

const PAGE = 100;

/** Reads the Ebbflow book over RPC, caching positions for `cacheTtlMs`. */
export class NearBookSource implements BookSource {
  private markets?: { at: number; value: Market[] };
  private positions = new Map<number, { at: number; value: Promise<PositionView[]> }>();

  constructor(
    private readonly rpc: NearRpc,
    readonly contractId: string,
    readonly network: string,
    private readonly cacheTtlMs = 2_000,
  ) {}

  async getMarkets(): Promise<Market[]> {
    // Markets only change when the owner adds one; cache them longer.
    if (this.markets && Date.now() - this.markets.at < 60_000) return this.markets.value;
    const raw = await this.rpc.view<Omit<Market, "market_id">[]>(this.contractId, "get_markets");
    const value = raw.map((m, i) => ({ ...m, market_id: i }));
    this.markets = { at: Date.now(), value };
    return value;
  }

  getPositions(marketId: number): Promise<PositionView[]> {
    const hit = this.positions.get(marketId);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.value;
    const value = this.fetchPositions(marketId);
    this.positions.set(marketId, { at: Date.now(), value });
    value.catch(() => this.positions.delete(marketId));
    return value;
  }

  private async fetchPositions(marketId: number): Promise<PositionView[]> {
    const all: PositionView[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await this.rpc.view<PositionView[]>(this.contractId, "get_positions", {
        market_id: marketId,
        from_index: from,
        limit: PAGE,
      });
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  }

  simulateSwap(msg: SwapMsg, amount: string): Promise<SimulateView> {
    return this.rpc.view<SimulateView>(this.contractId, "simulate_swap", { msg, amount });
  }

  async isRegistered(tokenId: string, accountId: string): Promise<boolean> {
    const b = await this.rpc.view<unknown>(tokenId, "storage_balance_of", { account_id: accountId });
    return b !== null;
  }

  blockHeight(): Promise<number> {
    return this.rpc.blockHeight();
  }
}
