import { BOOK, MARKET } from "./config";
import { view } from "./rpc";
import { storageDepositTx, type TxSpec } from "./tx";

export interface RegCheck { contract: string; label: string; registered: boolean; deposit: bigint }

const TARGETS = [
  { contract: BOOK, label: "Ebbflow book" },
  { contract: MARKET.base, label: MARKET.baseSymbol },
  { contract: MARKET.quote, label: MARKET.quoteSymbol },
];

/** NEP-145 registration status for `accountId` on the book and both market tokens. */
export async function checkRegistration(accountId: string): Promise<RegCheck[]> {
  return Promise.all(
    TARGETS.map(async (t) => {
      const bal = await view<unknown>(t.contract, "storage_balance_of", { account_id: accountId });
      if (bal !== null) return { ...t, registered: true, deposit: 0n };
      const bounds = await view<{ min: string }>(t.contract, "storage_balance_bounds").catch(() => ({ min: "1250000000000000000000" }));
      return { ...t, registered: false, deposit: BigInt(bounds.min) };
    }),
  );
}

export const registrationTxs = (accountId: string, checks: RegCheck[]): TxSpec[] =>
  checks.filter((c) => !c.registered).map((c) => storageDepositTx(c.contract, accountId, c.deposit));
