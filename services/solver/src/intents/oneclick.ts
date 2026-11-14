/**
 * Thin client for the 1Click swap API (https://1click.chaindefuser.com). Lets a user fund an Ebbflow
 * trade from any chain: the swap lands USDC or wNEAR on NEAR mainnet, ready to trade on the book.
 * The API key stays on the server.
 */
export const ONECLICK_URL = "https://1click.chaindefuser.com";

export interface OneClickToken {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price?: string | number;
}

export class OneClickError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface SwapQuoteInput {
  originAsset: string;
  destinationAsset: string;
  /** Raw units of the origin asset (exact input). */
  amount: string;
  /** NEAR account that receives the output. */
  recipient: string;
  /** Where to refund if the swap fails (an address on the origin chain). */
  refundTo: string;
  slippageBps?: number;
  /** Dry quotes show prices without creating a deposit address. */
  dry?: boolean;
}

export class OneClick {
  private tokens?: { at: number; data: OneClickToken[] };

  constructor(
    private readonly apiKey?: string,
    private readonly base = ONECLICK_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Dry quotes work without a key (verified live); deposit addresses and status need one. */
  get hasKey(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", ...(this.apiKey ? { "x-api-key": this.apiKey } : {}) };
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, { ...init, headers: { ...this.headers(), ...(init?.headers ?? {}) } });
    const text = await res.text();
    if (!res.ok) throw new OneClickError(res.status, text.slice(0, 300) || res.statusText);
    return JSON.parse(text) as T;
  }

  /** Supported assets across chains (cached 5 minutes). */
  async getTokens(): Promise<OneClickToken[]> {
    if (this.tokens && Date.now() - this.tokens.at < 300_000) return this.tokens.data;
    const data = await this.call<OneClickToken[]>("/v0/tokens");
    this.tokens = { at: Date.now(), data };
    return data;
  }

  async quote(i: SwapQuoteInput): Promise<unknown> {
    const dry = i.dry ?? true;
    if (!dry && !this.apiKey) throw new OneClickError(503, "INTENTS_API_KEY is required to get a deposit address");
    return this.call("/v0/quote", {
      method: "POST",
      body: JSON.stringify({
        dry,
        swapType: "EXACT_INPUT",
        slippageTolerance: i.slippageBps ?? 100,
        originAsset: i.originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: i.destinationAsset,
        amount: i.amount,
        refundTo: i.refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient: i.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
  }

  async status(depositAddress: string): Promise<unknown> {
    if (!this.apiKey) throw new OneClickError(503, "INTENTS_API_KEY is required to check swap status");
    return this.call(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`);
  }
}
