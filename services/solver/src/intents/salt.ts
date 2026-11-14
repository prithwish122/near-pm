import { randomBytes } from "node:crypto";
import type { NearRpc } from "../chain.js";
import { VERIFIER_CONTRACT } from "./nep413.js";

/**
 * Nonces for the Intents verifier are 32 bytes: the contract's current 4-byte salt followed by 28
 * unique bytes (per the verifier docs). The salt rotates, so it is re-read from `current_salt`.
 */
export class NonceSource {
  private cached?: { salt: Buffer; at: number };

  constructor(
    private readonly rpc: Pick<NearRpc, "view">,
    private readonly ttlMs = 60_000,
    private readonly verifier = VERIFIER_CONTRACT,
  ) {}

  private async salt(): Promise<Buffer> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.salt;
    const hex = await this.rpc.view<string>(this.verifier, "current_salt", {});
    if (!/^[0-9a-f]{8}$/i.test(hex)) throw new Error(`unexpected current_salt value: ${hex}`);
    const salt = Buffer.from(hex, "hex");
    this.cached = { salt, at: Date.now() };
    return salt;
  }

  async next(): Promise<Buffer> {
    return Buffer.concat([await this.salt(), randomBytes(28)]);
  }
}
