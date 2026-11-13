"use client";
import Link from "next/link";
import { useState } from "react";
import { Btn, Card, Field, Notice, PageHead, Skeleton, Stat } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { BOOK, MARKETS, type MarketConfig } from "@/lib/config";
import type { PositionView } from "@/lib/api";
import { fmtNear, fmtUnits, parseAmount, timeAgo } from "@/lib/format";
import { ftBalance, nearBalance, view } from "@/lib/rpc";
import { closePositionTx, withdrawTx } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";
import { formatPrice, PRICE_SCALE } from "@ebbflow/curve-math";

const price = (p: string, m: MarketConfig) => formatPrice(BigInt(p), m.quote_decimals, 4);

function WithdrawRow({ symbol, token, decimals, wallet, internal }: { symbol: string; token: string; decimals: number; wallet: bigint; internal: bigint }) {
  const { send } = useWallet();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amt = parseAmount(v, decimals);
  const over = amt !== null && amt > internal;
  const go = async () => {
    setBusy(true); setErr(null);
    try { await send([withdrawTx(BOOK, token, amt ?? undefined)]); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <tr className="border-t border-white/5 align-top">
      <td className="py-3 pr-3 font-medium">{symbol}</td>
      <td className="py-3 pr-3 tabular-nums">{fmtUnits(wallet, decimals, 4)}</td>
      <td className="py-3 pr-3 tabular-nums">{fmtUnits(internal, decimals, 4)}</td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <div className="w-32"><Field label={`${symbol} to withdraw`} value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" error={over ? "Exceeds balance" : null} className="[&>label]:sr-only [&>div]:mt-0" /></div>
          <Btn variant="ghost" className="h-9 px-3 text-[12px]" onClick={() => setV(fmtUnits(internal, decimals, decimals).replace(/,/g, ""))} disabled={internal === 0n}>Max</Btn>
          <Btn className="h-9 px-3 text-[12px]" onClick={go} disabled={busy || internal === 0n || over || (v !== "" && amt === null)}>{busy ? "…" : "Withdraw"}</Btn>
        </div>
        {err && <p className="mt-1 text-[11px] text-rose-300">{err}</p>}
      </td>
    </tr>
  );
}

function Position({ p, m, onClose }: { p: PositionView; m: MarketConfig; onClose: () => void }) {
  const unit = 10n ** BigInt(m.base_decimals);
  const s = p.stats;
  const avg = (quote: string, base: string) => (BigInt(base) === 0n ? null : formatPrice((BigInt(quote) * unit * PRICE_SCALE) / BigInt(base), m.quote_decimals, 4));
  const sellAvg = avg(s.quote_received, s.base_sold);
  const buyAvg = avg(s.quote_spent, s.base_bought);
  const spread = sellAvg && buyAvg ? (Number(sellAvg) - Number(buyAvg)).toFixed(4) : null;
  const both = p.ask && p.bid;
  const side = (label: string, color: string, x: PositionView["ask"], remaining: string) => x && (
    <div className="rounded-xl bg-white/[0.04] p-3.5 text-[12px]">
      <p className={`font-medium ${color}`}>{label}</p>
      <dl className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between"><dt className="text-white/50">Remaining</dt><dd>{remaining}</dd></div>
        <div className="flex justify-between"><dt className="text-white/50">Current price</dt><dd>{price(x.current_price, m)}</dd></div>
        <div className="flex justify-between"><dt className="text-white/50">Range</dt><dd>{price(x.start_price, m)} → {price(x.end_price, m)}</dd></div>
        <div className="flex justify-between"><dt className="text-white/50">Alpha</dt><dd>{x.alpha}</dd></div>
      </dl>
    </div>
  );
  return (
    <Card title={`Position #${p.position_id}`} aside={<div className="flex items-center gap-3"><span className="text-[11px] text-white/45">{p.stats.fills} fill{p.stats.fills === 1 ? "" : "s"} · created {timeAgo(p.created_at_ms)}</span><Btn variant="danger" className="h-8 px-3 text-[12px]" onClick={onClose}>Close</Btn></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {side(`Ask (sell ${m.baseSymbol})`, "text-mint", p.ask, p.ask ? `${fmtUnits(p.ask.remaining, m.base_decimals, 4)} ${m.baseSymbol}` : "")}
        {side(`Bid (buy ${m.baseSymbol})`, "text-sky-300", p.bid, p.bid ? `${fmtUnits(p.bid.remaining, m.quote_decimals, 2)} ${m.quoteSymbol}` : "")}
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-[12px] tabular-nums sm:grid-cols-2">
        <div className="flex justify-between"><dt className="text-white/50">Sold</dt><dd>{fmtUnits(s.base_sold, m.base_decimals, 4)} {m.baseSymbol}{sellAvg ? ` @ ${sellAvg}` : ""}</dd></div>
        <div className="flex justify-between"><dt className="text-white/50">Bought</dt><dd>{fmtUnits(s.base_bought, m.base_decimals, 4)} {m.baseSymbol}{buyAvg ? ` @ ${buyAvg}` : ""}</dd></div>
        {both && <div className="flex justify-between"><dt className="text-white/50">Recycled to bid</dt><dd>{fmtUnits(s.quote_received, m.quote_decimals, 4)} {m.quoteSymbol}</dd></div>}
        {both && <div className="flex justify-between"><dt className="text-white/50">Recycled to ask</dt><dd>{fmtUnits(s.base_bought, m.base_decimals, 4)} {m.baseSymbol}</dd></div>}
        <div className="flex justify-between"><dt className="text-white/50">Realised spread</dt><dd>{spread ? `${spread} ${m.quoteSymbol}/${m.baseSymbol}` : "n/a (needs a sell and a buy)"}</dd></div>
      </dl>
    </Card>
  );
}

export default function PortfolioPage() {
  const m = MARKETS[0]!;
  const { accountId, connect, send, ready } = useWallet();
  const [closing, setClosing] = useState<PositionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, loading, error } = usePolling(async () => {
    if (!accountId) return null;
    const [near, wb, wq, ib, iq, positions] = await Promise.all([
      nearBalance(accountId),
      ftBalance(m.base, accountId).catch(() => 0n),
      ftBalance(m.quote, accountId).catch(() => 0n),
      view<string>(BOOK, "get_balance", { account_id: accountId, token_id: m.base }),
      view<string>(BOOK, "get_balance", { account_id: accountId, token_id: m.quote }),
      view<PositionView[]>(BOOK, "get_positions_by_owner", { account_id: accountId }),
    ]);
    return { near, wb, wq, ib: BigInt(ib), iq: BigInt(iq), positions };
  }, [accountId], 5000);

  const confirmClose = async () => {
    if (!closing) return;
    setBusy(true); setErr(null);
    try { await send([closePositionTx(BOOK, closing.position_id)]); setClosing(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (!accountId)
    return (<><PageHead title="Portfolio" sub="Your balances, positions and earnings." /><Card><p className="text-[13px] text-white/60">Connect a wallet to see your portfolio.</p><Btn className="mt-4" onClick={connect} disabled={!ready}>Connect wallet</Btn></Card></>);

  return (
    <>
      <PageHead title="Portfolio" sub={<>Closing a position returns its remaining inventory to your book balance. Withdraw moves it to your wallet.</>} />
      {error && <div className="mb-5"><Notice tone="error" title="Could not load your data">{error.message}</Notice></div>}

      <Card title="Balances" className="mb-5">
        {loading && !data ? <Skeleton className="h-28" /> : data && (
          <>
            <div className="mb-5"><Stat label="NEAR (gas and storage)" value={`${fmtNear(data.near)} NEAR`} /></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-white/40"><th className="pb-2 font-normal">Token</th><th className="pb-2 font-normal">Wallet</th><th className="pb-2 font-normal">In book</th><th className="pb-2 font-normal">Withdraw from book</th></tr></thead>
                <tbody>
                  <WithdrawRow symbol={m.baseSymbol} token={m.base} decimals={m.base_decimals} wallet={data.wb} internal={data.ib} />
                  <WithdrawRow symbol={m.quoteSymbol} token={m.quote} decimals={m.quote_decimals} wallet={data.wq} internal={data.iq} />
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <h2 className="mb-3 text-[15px] font-medium text-white/90">Positions</h2>
      {loading && !data ? <Skeleton className="h-40" /> : data && data.positions.length === 0 ? (
        <Card><p className="text-[13px] text-white/60">You have no open positions. <Link href="/make" className="underline underline-offset-2">Publish a curve →</Link></p></Card>
      ) : (
        <div className="space-y-4">{data?.positions.map((p) => <Position key={p.position_id} p={p} m={m} onClose={() => setClosing(p)} />)}</div>
      )}

      {closing && (
        <div role="dialog" aria-modal="true" aria-labelledby="close-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="glass w-full max-w-sm rounded-2xl bg-[#0b1f15] p-6">
            <h3 id="close-title" className="text-[16px] font-medium">Close position #{closing.position_id}?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">Remaining inventory returns to your book balance and the 0.01 NEAR storage deposit is refunded. You can withdraw afterwards.</p>
            {err && <p role="alert" className="mt-3 text-[12px] text-rose-300">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => { setClosing(null); setErr(null); }}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmClose} disabled={busy}>{busy ? "Waiting for wallet…" : "Close position"}</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
