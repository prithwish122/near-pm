"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "@near-wallet-selector/modal-ui/styles.css";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { BOOK, NETWORK } from "@/lib/config";
import type { TxOutcome } from "@/lib/rpc";
import type { TxSpec } from "@/lib/tx";

interface Ctx {
  ready: boolean;
  accountId: string | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  /** Signs and sends each transaction in order. Browser wallets redirect away; popup wallets return outcomes. */
  send: (txs: TxSpec[]) => Promise<TxOutcome[] | undefined>;
  /** Outcomes from the last popup-wallet send, or null. */
  outcomes: TxOutcome[] | null;
  clearOutcomes: () => void;
}

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
};

interface Sender {
  signAndSendTransaction(p: { receiverId: string; actions: unknown[]; callbackUrl?: string }): Promise<TxOutcome | void>;
  signAndSendTransactions(p: { transactions: { receiverId: string; actions: unknown[] }[]; callbackUrl?: string }): Promise<TxOutcome[] | void>;
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<TxOutcome[] | null>(null);
  const selectorRef = useRef<WalletSelector | null>(null);
  const modalRef = useRef<WalletSelectorModal | null>(null);
  const actionsRef = useRef<typeof import("@near-wallet-selector/core").actionCreators | null>(null);

  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined;
    let cancelled = false;
    (async () => {
      const [core, modalUi, my, meteor, here] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/modal-ui"),
        import("@near-wallet-selector/my-near-wallet"),
        import("@near-wallet-selector/meteor-wallet"),
        import("@near-wallet-selector/here-wallet"),
      ]);
      const selector = await core.setupWalletSelector({
        network: NETWORK,
        modules: [my.setupMyNearWallet(), meteor.setupMeteorWallet(), here.setupHereWallet()],
      });
      if (cancelled) return;
      selectorRef.current = selector;
      actionsRef.current = core.actionCreators;
      modalRef.current = modalUi.setupModal(selector, { contractId: BOOK });
      const pick = (s: ReturnType<WalletSelector["store"]["getState"]>) => s.accounts.find((a) => a.active)?.accountId ?? s.accounts[0]?.accountId ?? null;
      setAccountId(pick(selector.store.getState()));
      sub = selector.store.observable.subscribe((s) => setAccountId(pick(s)));
      setReady(true);
    })().catch((e) => {
      console.error("wallet selector failed to initialise", e);
      setReady(true);
    });
    return () => { cancelled = true; sub?.unsubscribe(); };
  }, []);

  const connect = useCallback(() => modalRef.current?.show(), []);
  const disconnect = useCallback(async () => {
    const w = await selectorRef.current?.wallet();
    await w?.signOut();
    setAccountId(null);
  }, []);

  const send = useCallback(async (txs: TxSpec[]) => {
    const selector = selectorRef.current;
    const actions = actionsRef.current;
    if (!selector || !actions || !accountId) throw new Error("Connect a wallet first");
    const toActions = (t: TxSpec) => t.calls.map((c) => actions.functionCall(c.method, c.args, BigInt(c.gas), BigInt(c.deposit)));
    const wallet = (await selector.wallet()) as unknown as Sender;
    const callbackUrl = window.location.origin + window.location.pathname;
    let res: TxOutcome[] | TxOutcome | void;
    if (txs.length === 1) res = await wallet.signAndSendTransaction({ receiverId: txs[0]!.receiverId, actions: toActions(txs[0]!), callbackUrl });
    else res = await wallet.signAndSendTransactions({ transactions: txs.map((t) => ({ receiverId: t.receiverId, actions: toActions(t) })), callbackUrl });
    if (!res) return undefined; // browser wallet: the page is redirecting
    const list = Array.isArray(res) ? res : [res];
    setOutcomes(list);
    return list;
  }, [accountId]);

  const value = useMemo(
    () => ({ ready, accountId, connect, disconnect, send, outcomes, clearOutcomes: () => setOutcomes(null) }),
    [ready, accountId, connect, disconnect, send, outcomes],
  );
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
