"use client";
import { useState } from "react";
import { Btn, Card, Field, Notice, PageHead, Skeleton } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { ApiError } from "@/lib/api";
import { DESTINATIONS, filterTokens, getFundStatus, getIntentsTokens, postFundQuote, summarizeFundQuote, type FundQuoteResponse, type IntentsToken } from "@/lib/intents";
import { usePolling } from "@/lib/usePolling";

export default function FundPage() {
  const { accountId } = useWallet();
  const [query, setQuery] = useState("usdc");
  const [origin, setOrigin] = useState<IntentsToken | null>(null);
  const [dest, setDest] = useState<(typeof DESTINATIONS)[number]>(DESTINATIONS[0]);
  const [amount, setAmount] = useState("10");
  const [recipient, setRecipient] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quote, setQuote] = useState<FundQuoteResponse | null>(null);
  const [dryQuote, setDryQuote] = useState(true);

  const tokens = usePolling(getIntentsTokens, [], 300_000);
  const list = tokens.data ? filterTokens(tokens.data.tokens, query) : [];
  const deposit = quote?.quote?.depositAddress;
  const status = usePolling(async () => (deposit ? getFundStatus(deposit) : null), [deposit], 8000);
  const to = recipient || "";

  const run = async (dry: boolean) => {
    if (!origin) return;
    setBusy(true); setErr(null); setQuote(null); setDryQuote(dry);
    try {
      setQuote(await postFundQuote({ origin, destination: dest.assetId, amount, recipient: to, refundTo, slippageBps: 100, dry }));
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const summary = quote && origin ? summarizeFundQuote(quote, origin.symbol, dest.symbol) : null;
  const canQuote = !!origin && !!to && !!refundTo && !!amount && !busy;

  return (
    <>
      <PageHead title="Fund" sub="Pay from any chain with NEAR Intents and receive wNEAR or USDC on NEAR, ready to trade on the book." />
      <div className="mb-5"><Notice tone="info" title="Mainnet only">NEAR Intents runs on NEAR mainnet and has no testnet. Use a mainnet NEAR account as the recipient. This page cannot fund the testnet deployment{accountId ? ` (connected: ${accountId})` : ""}.</Notice></div>
      {tokens.error && <div className="mb-5"><Notice tone="error" title="Cannot load assets">{String(tokens.error instanceof Error ? tokens.error.message : tokens.error)}</Notice></div>}
      {tokens.data && !tokens.data.enabled && <div className="mb-5"><Notice tone="warn" title="Quotes are disabled">The solver has no INTENTS_API_KEY, so you can browse assets but not request quotes.</Notice></div>}
      {err && <div className="mb-5"><Notice tone="error" title="Quote failed">{err}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="1. Choose what you pay with">
          <Field label="Search assets" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="usdc, eth, sol…" />
          {tokens.loading && !tokens.data ? <Skeleton className="mt-3 h-24" /> : (
            <ul className="mt-3 max-h-56 space-y-1 overflow-auto text-[13px]">
              {list.map((t) => (
                <li key={t.assetId}>
                  <button onClick={() => setOrigin(t)} className={`flex w-full justify-between rounded-lg px-3 py-2 text-left transition ${origin?.assetId === t.assetId ? "bg-white text-dark" : "hover:bg-white/10"}`}>
                    <span>{t.symbol}</span><span className="opacity-60">{t.blockchain}</span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="px-3 py-2 text-white/50">No matches.</li>}
            </ul>
          )}
        </Card>

        <Card title="2. Amount and destination">
          <Field label={`Amount${origin ? ` (${origin.symbol} on ${origin.blockchain})` : ""}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div className="mt-4 flex gap-2">
            {DESTINATIONS.map((d) => <Btn key={d.assetId} variant={dest.assetId === d.assetId ? "primary" : "ghost"} onClick={() => setDest(d)}>Receive {d.symbol}</Btn>)}
          </div>
          <Field className="mt-4" label="Recipient (mainnet NEAR account)" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="you.near" />
          <Field className="mt-4" label={`Refund address${origin ? ` on ${origin.blockchain}` : ""}`} value={refundTo} onChange={(e) => setRefundTo(e.target.value.trim())} hint="Where the funds go back if the swap fails." />
          <div className="mt-4 flex gap-2">
            <Btn className="flex-1" disabled={!canQuote || !tokens.data?.enabled} onClick={() => run(true)}>{busy ? "Quoting…" : "Get quote"}</Btn>
            <Btn variant="ghost" className="flex-1" disabled={!canQuote || !tokens.data?.enabled} onClick={() => run(false)}>Get deposit address</Btn>
          </div>
        </Card>
      </div>

      {summary && (
        <Card className="mt-5" title={dryQuote ? "Quote" : "Send your deposit"}>
          <p className="text-[14px]">{summary}</p>
          {deposit ? (
            <div className="mt-3 text-[13px]">
              <p className="text-white/60">Send exactly the quoted amount of {origin?.symbol} on {origin?.blockchain} to:</p>
              <p className="mt-1 break-all rounded-lg bg-white/[0.06] px-3 py-2 font-mono text-[12px]">{deposit}</p>
              <p className="mt-2 text-white/60">Status: {status.data?.status ?? "PENDING_DEPOSIT"}. Once it reads SUCCESS, trade on the book from your mainnet account.</p>
            </div>
          ) : <p className="mt-2 text-[12px] text-white/50">Dry quote: nothing was reserved. Press “Get deposit address” to proceed.</p>}
        </Card>
      )}
    </>
  );
}
