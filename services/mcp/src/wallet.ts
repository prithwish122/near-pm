import { Account, type KeyPairString } from "near-api-js";

export interface TxResult {
  hash: string;
  success: boolean;
  logs: string[];
  failure?: string;
}

/** The agent's signing account. Its balance is the agent's whole budget. */
export interface AgentWallet {
  accountId: string;
  call(contractId: string, methodName: string, args: object, deposit: bigint, gas: bigint): Promise<TxResult>;
}

export class NearWallet implements AgentWallet {
  private readonly account: Account;

  constructor(
    readonly accountId: string,
    privateKey: string,
    rpcUrl: string,
  ) {
    this.account = new Account(accountId, rpcUrl, privateKey as KeyPairString);
  }

  async call(contractId: string, methodName: string, args: object, deposit: bigint, gas: bigint): Promise<TxResult> {
    try {
      const r = await this.account.callFunctionRaw({ contractId, methodName, args: args as Record<string, unknown>, deposit, gas });
      const logs = r.receipts_outcome.flatMap((o) => o.outcome.logs);
      const status = r.status as unknown as Record<string, unknown>;
      const failure = typeof status === "object" && status && "Failure" in status ? JSON.stringify(status.Failure) : undefined;
      return { hash: r.transaction.hash, success: !failure, logs, failure };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const hash = (e as { context?: { transactionHash?: string } })?.context?.transactionHash ?? "";
      return { hash, success: false, logs: [], failure: message };
    }
  }
}

/** Ebbflow NEP-297 events found in transaction logs. */
export function ebbflowEvents(logs: string[]): { event: string; data: Record<string, unknown> }[] {
  return logs
    .filter((l) => l.startsWith("EVENT_JSON:"))
    .map((l) => JSON.parse(l.slice("EVENT_JSON:".length)) as { standard: string; event: string; data: Record<string, unknown>[] })
    .filter((e) => e.standard === "ebbflow")
    .map((e) => ({ event: e.event, data: e.data[0] ?? {} }));
}
