/** near-api-js backed implementations of the solver account's on-chain actions. */
import { Account, type KeyPairString } from "near-api-js";
import type { NearRpc } from "../chain.js";
import type { HedgeChain } from "./hedger.js";
import { VERIFIER_CONTRACT } from "./nep413.js";

const GAS_100T = 100_000_000_000_000n;
const GAS_150T = 150_000_000_000_000n;
const ONE_YOCTO = 1n;
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR

export class SolverAccount implements HedgeChain {
  private readonly account: Account;

  constructor(
    readonly accountId: string,
    secretKey: string,
    rpcUrl: string,
    private readonly rpc: Pick<NearRpc, "view">,
    private readonly verifier = VERIFIER_CONTRACT,
  ) {
    this.account = new Account(accountId, rpcUrl, secretKey as KeyPairString);
  }

  private async call(contractId: string, methodName: string, args: Record<string, unknown>, deposit: bigint, gas: bigint) {
    const r = await this.account.callFunctionRaw({ contractId, methodName, args, deposit, gas });
    const status = r.status as unknown as Record<string, unknown>;
    if (typeof status === "object" && status && "Failure" in status) {
      throw new Error(`${contractId}.${methodName} failed: ${JSON.stringify(status.Failure)}`);
    }
    return r;
  }

  async intentsBalance(token: string): Promise<bigint> {
    return BigInt(await this.rpc.view<string>(this.verifier, "mt_balance_of", { account_id: this.accountId, token_id: `nep141:${token}` }));
  }

  async walletBalance(token: string): Promise<bigint> {
    return BigInt(await this.rpc.view<string>(token, "ft_balance_of", { account_id: this.accountId }));
  }

  async withdraw(token: string, amount: bigint): Promise<void> {
    await this.call(this.verifier, "ft_withdraw", { token, receiver_id: this.accountId, amount: amount.toString() }, ONE_YOCTO, GAS_100T);
  }

  async bookSwap(token: string, args: { receiver_id: string; amount: string; msg: string }): Promise<void> {
    await this.call(token, "ft_transfer_call", args, ONE_YOCTO, GAS_150T);
  }

  async deposit(token: string, amount: bigint): Promise<void> {
    await this.call(token, "ft_transfer_call", { receiver_id: this.verifier, amount: amount.toString(), msg: this.accountId }, ONE_YOCTO, GAS_100T);
  }

  /** One-off setup: register the signing key with the verifier so signed token_diffs are accepted. */
  async registerKey(publicKey: string): Promise<void> {
    await this.call(this.verifier, "add_public_key", { public_key: publicKey }, ONE_YOCTO, GAS_100T);
  }

  /** One-off setup: NEP-145 registration so the account can hold `token` (and the book can pay it). */
  async registerStorage(token: string, accountId = this.accountId): Promise<void> {
    await this.call(token, "storage_deposit", { account_id: accountId, registration_only: true }, STORAGE_DEPOSIT, 30_000_000_000_000n);
  }
}
