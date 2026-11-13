"use client";
import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { MARKET, txUrl } from "@/lib/config";
import { txStatus } from "@/lib/rpc";
import { describeOutcome, type Described } from "@/lib/txResult";
import { Btn, Notice } from "./ui";
import { useWallet } from "./WalletProvider";

interface Shown extends Described { hashes: string[] }

/** Result of the latest transaction: from a popup wallet's outcome, or from `transactionHashes` after a wallet redirect. */
export default function TxBanner() {
  const { accountId, outcomes, clearOutcomes } = useWallet();
  const [shown, setShown] = useState<Shown | null>(null);
  const [rejected, setRejected] = useState(false);
  const [loading, setLoading] = useState(false);

  const strip = () => {
    const u = new URL(window.location.href);
    ["transactionHashes", "errorCode", "errorMessage", "account_id", "public_key", "all_keys"].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState({}, "", u.pathname + (u.search || ""));
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("errorCode")) { setRejected(true); strip(); }
  }, []);

  // Popup wallets return outcomes directly.
  useEffect(() => {
    if (!outcomes?.length) return;
    const last = outcomes[outcomes.length - 1]!;
    setShown({ ...describeOutcome(last, MARKET), hashes: outcomes.map((o) => o.transaction?.hash).filter((h): h is string => !!h) });
    window.dispatchEvent(new Event("ebbflow:tx"));
  }, [outcomes]);

  // Browser wallets redirect back with ?transactionHashes=...
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("transactionHashes");
    if (!raw || !accountId) return;
    const hashes = raw.split(",").filter(Boolean);
    strip();
    setLoading(true);
    (async () => {
      try {
        const o = await txStatus(hashes[hashes.length - 1]!, accountId);
        setShown({ ...describeOutcome(o, MARKET), hashes });
      } catch {
        setShown({ tone: "warn", title: "Transaction submitted", lines: ["We could not read its outcome yet. Check the explorer."], hashes });
      } finally {
        setLoading(false);
        window.dispatchEvent(new Event("ebbflow:tx"));
      }
    })();
  }, [accountId]);

  if (rejected) return <div className="mb-5"><Notice tone="warn" title="Transaction cancelled in wallet" action={<button aria-label="Dismiss" onClick={() => setRejected(false)}><X size={14} /></button>}>Nothing was sent. Your inputs are unchanged.</Notice></div>;
  if (loading) return <div className="mb-5"><Notice tone="info" title="Reading transaction result…" /></div>;
  if (!shown) return null;
  const close = () => { setShown(null); clearOutcomes(); };
  return (
    <div className="mb-5">
      <Notice
        tone={shown.tone}
        title={shown.title}
        action={<button aria-label="Dismiss" onClick={close}><X size={14} /></button>}
      >
        {shown.lines.map((l, i) => <p key={i}>{l}</p>)}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {shown.hashes.map((h) => (
            <a key={h} href={txUrl(h)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">View transaction <ExternalLink size={11} /></a>
          ))}
          {shown.requote && <Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => { window.dispatchEvent(new Event("ebbflow:requote")); close(); }}>Re-quote</Btn>}
        </div>
      </Notice>
    </div>
  );
}
