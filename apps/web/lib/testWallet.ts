/**
 * DEV-ONLY signer for automated UI tests: signs with a throwaway testnet key from
 * NEXT_PUBLIC_TEST_PRIVATE_KEY instead of a browser wallet. Never enabled on mainnet.
 * (NEXT_PUBLIC_ values are visible in the browser bundle: use a worthless testnet key only.)
 */
import { IS_MAINNET, RPC_URLS } from "./config";
import type { TxOutcome } from "./rpc";
import type { TxSpec } from "./tx";

const ID = process.env.NEXT_PUBLIC_TEST_ACCOUNT_ID;
const KEY = process.env.NEXT_PUBLIC_TEST_PRIVATE_KEY;

if (KEY && IS_MAINNET) throw new Error("NEXT_PUBLIC_TEST_PRIVATE_KEY must not be set when running against mainnet.");

export const TEST_ACCOUNT: string | null = !IS_MAINNET && ID && KEY ? ID : null;

export async function sendWithTestKey(txs: TxSpec[]): Promise<TxOutcome[]> {
  if (!TEST_ACCOUNT || !KEY) throw new Error("test wallet is not enabled");
  const { Account, KeyPairSigner, providers, transactions } = await import("near-api-js");
  const account = new Account(TEST_ACCOUNT, new providers.JsonRpcProvider({ url: RPC_URLS[0]! }), KeyPairSigner.fromSecretKey(KEY as `ed25519:${string}`));
  const out: TxOutcome[] = [];
  // Sequential, like a wallet batch: a failed transaction stops the rest.
  for (const t of txs) {
    const actions = t.calls.map((c) => transactions.functionCall(c.method, c.args, BigInt(c.gas), BigInt(c.deposit)));
    out.push((await account.signAndSendTransaction({ receiverId: t.receiverId, actions })) as unknown as TxOutcome);
  }
  return out;
}
