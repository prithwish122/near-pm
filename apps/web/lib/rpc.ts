import { RPC_URLS } from "./config";

export class RpcError extends Error {}

/** NEAR JSON-RPC with endpoint failover. View calls are free. */
async function request<T>(method: string, params: unknown): Promise<T> {
  let last: unknown;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "ebbflow-web", method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new RpcError(`${url}: HTTP ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown; cause?: { name?: string } } };
      if (body.error) throw new RpcError(`${body.error.cause?.name ?? body.error.message ?? "rpc error"}: ${JSON.stringify(body.error.data ?? "")}`);
      return body.result as T;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new RpcError(String(last));
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

export async function view<T>(accountId: string, methodName: string, args: unknown = {}): Promise<T> {
  const r = await request<{ result?: number[]; error?: string }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: accountId,
    method_name: methodName,
    args_base64: b64(JSON.stringify(args)),
  });
  if (r.error || !r.result) throw new RpcError(`${accountId}.${methodName}: ${r.error ?? "no result"}`);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result))) as T;
}

/** Native NEAR balance in yoctoNEAR (0 if the account does not exist). */
export async function nearBalance(accountId: string): Promise<bigint> {
  try {
    const r = await request<{ amount: string }>("query", { request_type: "view_account", finality: "optimistic", account_id: accountId });
    return BigInt(r.amount);
  } catch {
    return 0n;
  }
}

export const ftBalance = async (token: string, accountId: string) => BigInt(await view<string>(token, "ft_balance_of", { account_id: accountId }));

export interface TxOutcome {
  status: unknown;
  transaction?: { hash?: string; signer_id?: string };
  receipts_outcome: { outcome: { logs: string[]; status: unknown } }[];
}

export async function txStatus(hash: string, senderId: string): Promise<TxOutcome> {
  return request<TxOutcome>("EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: senderId, wait_until: "EXECUTED" });
}
