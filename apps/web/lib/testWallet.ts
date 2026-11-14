/**
 * DEV-ONLY signer for automated UI tests: signs with throwaway testnet keys from
 * NEXT_PUBLIC_TEST_* instead of a browser wallet. Never enabled on mainnet.
 * (NEXT_PUBLIC_ values are visible in the browser bundle: use worthless testnet keys only.)
 *
 * Up to two accounts: NEXT_PUBLIC_TEST_ACCOUNT_ID/KEY and NEXT_PUBLIC_TEST2_ACCOUNT_ID/KEY.
 * The active one is the id in localStorage["ebbflow:test-account"], else the first.
 */
import { IS_MAINNET, RPC_URLS } from "./config";
import type { TxOutcome } from "./rpc";
import type { TxSpec } from "./tx";

interface TestAccount { id: string; key: string }

// Literal env access so Next inlines each value.
const CANDIDATES: (TestAccount | null)[] = [
  process.env.NEXT_PUBLIC_TEST_ACCOUNT_ID && process.env.NEXT_PUBLIC_TEST_PRIVATE_KEY ? { id: process.env.NEXT_PUBLIC_TEST_ACCOUNT_ID, key: process.env.NEXT_PUBLIC_TEST_PRIVATE_KEY } : null,
  process.env.NEXT_PUBLIC_TEST2_ACCOUNT_ID && process.env.NEXT_PUBLIC_TEST2_PRIVATE_KEY ? { id: process.env.NEXT_PUBLIC_TEST2_ACCOUNT_ID, key: process.env.NEXT_PUBLIC_TEST2_PRIVATE_KEY } : null,
];
const ACCOUNTS = CANDIDATES.filter((a): a is TestAccount => a !== null);

if (ACCOUNTS.length && IS_MAINNET) throw new Error("NEXT_PUBLIC_TEST_* keys must not be set when running against mainnet.");

export const STORAGE_KEY = "ebbflow:test-account";
export const HAS_TEST_WALLET = !IS_MAINNET && ACCOUNTS.length > 0;

function active(): TestAccount | null {
  if (!HAS_TEST_WALLET) return null;
  let chosen: string | null = null;
  try { chosen = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null; } catch { /* storage unavailable */ }
  return ACCOUNTS.find((a) => a.id === chosen) ?? ACCOUNTS[0]!;
}

/** Account id the test wallet is acting as (client-side), or null when disabled. */
export const activeTestAccount = (): string | null => active()?.id ?? null;

export async function sendWithTestKey(txs: TxSpec[]): Promise<TxOutcome[]> {
  const acct = active();
  if (!acct) throw new Error("test wallet is not enabled");
  const { Account, KeyPairSigner, providers, transactions } = await import("near-api-js");
  const account = new Account(acct.id, new providers.JsonRpcProvider({ url: RPC_URLS[0]! }), KeyPairSigner.fromSecretKey(acct.key as `ed25519:${string}`));
  const out: TxOutcome[] = [];
  // Sequential, like a wallet batch: a failed transaction stops the rest.
  for (const t of txs) {
    const actions = t.calls.map((c) => transactions.functionCall(c.method, c.args, BigInt(c.gas), BigInt(c.deposit)));
    out.push((await account.signAndSendTransaction({ receiverId: t.receiverId, actions })) as unknown as TxOutcome);
  }
  return out;
}
