/** Pure builders for the transactions the app sends. The wallet layer turns these into signed actions. */
import type { Quote } from "./api";

export interface Call { method: string; args: Record<string, unknown>; gas: string; deposit: string }
export interface TxSpec { receiverId: string; calls: Call[] }

const tgas = (n: number) => (BigInt(n) * 10n ** 12n).toString();
export const GAS = {
  ftCall: tgas(60),
  createPosition: tgas(30),
  close: tgas(30),
  withdraw: tgas(100),
  simple: tgas(30),
};
export const ONE_YOCTO = "1";
/** `create_position` storage deposit (POSITION_STORAGE = 0.01 NEAR); the contract refunds any excess. */
export const POSITION_STORAGE = (10n ** 22n).toString();

const tx = (receiverId: string, method: string, args: Record<string, unknown>, gas: string, deposit: string): TxSpec => ({
  receiverId,
  calls: [{ method, args, gas, deposit }],
});

/** Deposit `amount` of `token` into the book's internal balance. */
export const depositTx = (token: string, book: string, amount: bigint) =>
  tx(token, "ft_transfer_call", { receiver_id: book, amount: amount.toString(), msg: JSON.stringify({ action: "deposit" }) }, GAS.ftCall, ONE_YOCTO);

export interface SideArgs { amount: string; start_price: string; end_price: string; alpha: number }
export const createPositionTx = (book: string, marketId: number, ask: SideArgs | null, bid: SideArgs | null) =>
  tx(book, "create_position", { market_id: marketId, ask, bid }, GAS.createPosition, POSITION_STORAGE);

export const closePositionTx = (book: string, positionId: string) => tx(book, "close_position", { position_id: positionId }, GAS.close, ONE_YOCTO);

/** `amount` omitted withdraws the whole balance. */
export const withdrawTx = (book: string, token: string, amount?: bigint) =>
  tx(book, "withdraw", { token_id: token, amount: amount === undefined ? null : amount.toString() }, GAS.withdraw, ONE_YOCTO);

/** The solver returns a ready-to-sign `ft_transfer_call`. */
export const swapTx = (q: Quote["tx"]): TxSpec => tx(q.receiver_id, q.method_name, q.args, q.gas, q.deposit);

export const mintTx = (token: string, amount: bigint) => tx(token, "mint", { amount: amount.toString() }, GAS.simple, "0");
export const wrapNearTx = (wnear: string, yocto: bigint) => tx(wnear, "near_deposit", {}, GAS.simple, yocto.toString());
export const storageDepositTx = (contract: string, accountId: string, deposit: bigint) =>
  tx(contract, "storage_deposit", { account_id: accountId, registration_only: true }, GAS.simple, deposit.toString());
