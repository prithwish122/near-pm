"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Eye, Layers, Wallet } from "lucide-react";
import { Btn, Card, Field, Notice, PageHead, Skeleton, cx } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { BOOK, MARKETS, type MarketConfig } from "@/lib/config";
import { getMarkets, type PositionView } from "@/lib/api";
import { DEMO_ACCOUNT, demoPortfolio } from "@/lib/demo";
import { fmtNear, fmtUnits, parseAmount, timeAgo } from "@/lib/format";
import { ftBalance, nearBalance, view } from "@/lib/rpc";
import { closePositionTx, withdrawTx } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";

const P = (raw: string, m: MarketConfig) => Number(raw) / 10 ** (12 + m.quote_decimals);
const N = (raw: bigint | string, d: number) => Number(BigInt(raw)) / 10 ** d;
const SHAPES = ["Flat", "Gentle", "Steep", "Sharp"];

function WithdrawRow({ symbol, token, decimals, wallet, internal, demo }: { symbol: string; token: string; decimals: number; wallet: bigint; internal: bigint; demo: boolean }) {
  const { send } = useWallet();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amt = parseAmount(v, decimals);
  const over = amt !== null && amt > internal;
  const go = async () => {
    setBusy(true); setErr(null);
    try { await send([withdrawTx(BOOK, token, amt ?? undefined)]); setV(""); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <tr className="border-t border-white/[0.05] align-middle">
      <td className="py-3 pl-4 pr-3"><span className="flex items-center gap-2.5"><span className={cx("grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold", symbol.startsWith("w") ? "bg-zinc-200 text-zinc-900" : "bg-[#2f6fe0] text-white")}>{symbol.startsWith("w") ? "N" : "$"}</span>{symbol}</span></td>
      <td className="num py-3 pr-3 text-right">{fmtUnits(wallet, decimals, 4)}</td>
      <td className="num py-3 pr-3 text-right">{fmtUnits(internal, decimals, 4)}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center justify-end gap-2">
          <div className="w-28"><Field label={`${symbol} to withdraw`} value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" error={over ? "Exceeds balance" : null} className="[&>div]:mt-0 [&>div]:py-1.5 [&>label]:sr-only" disabled={demo} /></div>
          <Btn variant="ghost" className="h-8 px-2.5 text-[11.5px]" onClick={() => setV(fmtUnits(internal, decimals, decimals).replace(/,/g, ""))} disabled={demo || internal === 0n}>Max</Btn>
          <Btn variant="ghost" className="h-8 px-3 text-[11.5px]" onClick={go} disabled={demo || busy || internal === 0n || over || (v !== "" && amt === null)} title={demo ? "The demo wallet signs nothing" : undefined}>{busy ? "…" : "Withdraw"}</Btn>
        </div>
        {err && <p className="mt-1 text-right text-[11px] text-rose-300">{err}</p>}
      </td>
    </tr>
  );
}

/** Horizontal price track: bid range on the left, ask range on the right, mid marker, consumed part shaded. */
function RangeTrack({ p, m, mid }: { p: PositionView; m: MarketConfig; mid: number | null }) {
  const pts = [p.bid && P(p.bid.end_price, m), p.bid && P(p.bid.start_price, m), p.ask && P(p.ask.start_price, m), p.ask && P(p.ask.end_price, m), mid].filter((x): x is number => x != null && x > 0);
  let lo = Math.min(...pts), hi = Math.max(...pts);
  const pad = (hi - lo) * 0.08 || 0.05; lo -= pad; hi += pad;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const seg = (a: number, b: number) => ({ left: x(Math.min(a, b)), width: `${(Math.abs(b - a) / (hi - lo)) * 100}%` });
  return (
    <div className="relative mt-6 h-10">
      <div className="absolute inset-x-0 top-4 h-[3px] rounded-full bg-white/[0.06]" />
      {p.bid && (() => { const s = P(p.bid.start_price, m), e = P(p.bid.end_price, m), c = P(p.bid.current_price, m); return (
        <>
          <div className={cx("absolute rounded-full bg-bid/70", s === e ? "top-[11px] h-[13px] w-[3px] -translate-x-1/2" : "top-4 h-[3px]")} style={s === e ? { left: x(s) } : seg(e, s)} />
          {c !== s && <div className="absolute top-[13px] h-[9px] rounded-sm bg-bid/25" style={seg(c, s)} title="Filled" />}
        </>
      ); })()}
      {p.ask && (() => { const s = P(p.ask.start_price, m), e = P(p.ask.end_price, m), c = P(p.ask.current_price, m); return (
        <>
          <div className={cx("absolute rounded-full bg-ask/70", s === e ? "top-[11px] h-[13px] w-[3px] -translate-x-1/2" : "top-4 h-[3px]")} style={s === e ? { left: x(s) } : seg(s, e)} />
          {c !== s && <div className="absolute top-[13px] h-[9px] rounded-sm bg-ask/25" style={seg(s, c)} title="Filled" />}
        </>
      ); })()}
      {mid && (() => {
        // A short tick through the bar only (never down into the range labels), with a quiet label above.
        // Near either end the label anchors to that side so it stays inside the card.
        const f = (mid - lo) / (hi - lo);
        const anchor = f < 0.12 ? "translate-x-0" : f > 0.88 ? "-translate-x-full" : "-translate-x-1/2";
        return (
          <>
            <span aria-hidden className="absolute top-[10px] h-[15px] w-[2px] -translate-x-1/2 rounded-full bg-white/80" style={{ left: x(mid) }} />
            {/* small, tight label whose box ends well above the tick (tick starts at 10px), so they never touch */}
            <span className={cx("absolute -top-2 whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-white/45", anchor)} style={{ left: x(mid) }}>
              mid <span className="text-white/80">{mid.toFixed(3)}</span>
            </span>
          </>
        );
      })()}
      <div className="num absolute inset-x-0 top-7 flex justify-between text-[10px] text-white/35"><span>{lo.toFixed(3)}</span><span>{hi.toFixed(3)}</span></div>
    </div>
  );
}

function Position({ p, m, mid, demo, onClose }: { p: PositionView; m: MarketConfig; mid: number | null; demo: boolean; onClose: () => void }) {
  const s = p.stats;
  const sold = N(s.base_sold, m.base_decimals), bought = N(s.base_bought, m.base_decimals);
  const recv = N(s.quote_received, m.quote_decimals), spent = N(s.quote_spent, m.quote_decimals);
  const pnl = mid != null ? recv - spent + (bought - sold) * mid : null;
  const sellAvg = sold ? recv / sold : null, buyAvg = bought ? spent / bought : null;
  const askLeft = p.ask ? N(p.ask.remaining, m.base_decimals) : 0;
  const bidLeft = p.bid ? N(p.bid.remaining, m.quote_decimals) : 0;
  const value = askLeft * (mid ?? 0) + bidLeft;
  const limit = p.ask && p.ask.start_price === p.ask.end_price && (!p.bid || p.bid.start_price === p.bid.end_price);
  const status = p.ask && p.bid ? "Quoting both sides" : p.ask ? "Ask only" : "Bid only";
  const shape = limit ? "Limit" : SHAPES[(p.ask ?? p.bid)!.alpha] ?? "Custom";
  return (
    <section className="panel rise rounded-2xl p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold">{m.baseSymbol} / {m.quoteSymbol}</h3>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-white/60">{shape}</span>
            <span className="flex items-center gap-1.5 rounded-full border border-bid/25 px-2 py-0.5 text-[10.5px] text-bid"><span className="h-1.5 w-1.5 rounded-full bg-bid" />{status}</span>
          </div>
          <p className="mt-1 text-[11.5px] text-white/40">#{p.position_id} · opened {timeAgo(p.created_at_ms)} · {s.fills} fill{s.fills === 1 ? "" : "s"}</p>
        </div>
        <div className="text-right">
          <p className="num text-[20px] font-medium">{value.toFixed(2)} <span className="text-[12px] text-white/45">{m.quoteSymbol}</span></p>
          {pnl != null && <p className={cx("num text-[11.5px]", pnl >= 0 ? "text-bid" : "text-ask")}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} {m.quoteSymbol} trading P&L</p>}
        </div>
      </header>
      <RangeTrack p={p} m={m} mid={mid} />
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-4">
        <div><dt className="label">Ask left</dt><dd className="num mt-1">{p.ask ? `${askLeft.toFixed(4)} ${m.baseSymbol}` : "—"}</dd></div>
        <div><dt className="label">Bid left</dt><dd className="num mt-1">{p.bid ? `${bidLeft.toFixed(2)} ${m.quoteSymbol}` : "—"}</dd></div>
        <div><dt className="label">Sold</dt><dd className="num mt-1">{sold.toFixed(4)}{sellAvg ? <span className="text-white/45"> @ {sellAvg.toFixed(4)}</span> : null}</dd></div>
        <div><dt className="label">Bought</dt><dd className="num mt-1">{bought.toFixed(4)}{buyAvg ? <span className="text-white/45"> @ {buyAvg.toFixed(4)}</span> : null}</dd></div>
      </dl>
      {p.ask && p.bid && (sold > 0 || bought > 0) && (
        <p className="mt-4 rounded-xl bg-white/[0.03] px-3 py-2 text-[11.5px] text-white/55">Recycled: {recv.toFixed(2)} {m.quoteSymbol} from asks topped up the bid; {bought.toFixed(4)} {m.baseSymbol} from bids topped up the ask.</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Link href="/trade" className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12px] text-white/60 hover:text-white">See on the book <ArrowUpRight size={12} /></Link>
        <Btn variant="danger" className="h-8 px-3 text-[12px]" onClick={onClose} disabled={demo} title={demo ? "The demo wallet signs nothing" : undefined}>Close position</Btn>
      </div>
    </section>
  );
}

export default function PortfolioPage() {
  const m = MARKETS[0]!;
  const { accountId, connect, send, ready } = useWallet();
  const [demo, setDemo] = useState(false);
  const [closing, setClosing] = useState<PositionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = !!accountId;
  const showing = live || demo;

  const markets = usePolling(getMarkets, [], 10000);
  const row = markets.data?.find((r) => r.market_id === m.market_id);
  const mid = row?.best_ask && row?.best_bid ? (Number(row.best_ask) + Number(row.best_bid)) / 2 : 5;

  const { data: chain, loading, error } = usePolling(async () => {
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
  const data = live ? chain : demo ? demoPortfolio() : null;
  const isDemo = !live && demo;

  const confirmClose = async () => {
    if (!closing) return;
    setBusy(true); setErr(null);
    try { await send([closePositionTx(BOOK, closing.position_id)]); setClosing(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (!showing)
    return (
      <>
        <PageHead title="Portfolio" sub="Your balances, curves and what they have earned." />
        <section className="panel relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-10">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-40 max-w-xl rounded-full bg-white/[0.04] blur-3xl" />
          <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]"><Layers size={20} className="text-white/70" /></span>
          <h2 className="relative mt-5 text-[22px] font-semibold tracking-tight">See what your curves are doing</h2>
          <p className="relative mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/50">Connect a NEAR wallet to see your balances, open positions and trading P&amp;L. Or look around with a demo maker account first.</p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-2">
            <Btn onClick={connect} className="h-11 px-5"><Wallet size={14} />Connect wallet</Btn>
            <Btn variant="ghost" onClick={() => setDemo(true)} className="h-11 px-5"><Eye size={14} />Explore with the demo wallet</Btn>
          </div>
          <p className="relative mt-3 text-[11px] text-white/35">The demo wallet holds two positions on {m.baseSymbol}/{m.quoteSymbol} and signs nothing.</p>
        </section>
      </>
    );

  const positions = data?.positions ?? [];
  const inCurves = positions.reduce((s, p) => s + (p.ask ? N(p.ask.remaining, m.base_decimals) * mid : 0) + (p.bid ? N(p.bid.remaining, m.quote_decimals) : 0), 0);
  const inBook = data ? N(data.ib, m.base_decimals) * mid + N(data.iq, m.quote_decimals) : 0;
  const inWallet = data ? N(data.wb, m.base_decimals) * mid + N(data.wq, m.quote_decimals) : 0;
  const total = inCurves + inBook + inWallet;
  const pnl = positions.reduce((s, p) => s + N(p.stats.quote_received, m.quote_decimals) - N(p.stats.quote_spent, m.quote_decimals) + (N(p.stats.base_bought, m.base_decimals) - N(p.stats.base_sold, m.base_decimals)) * mid, 0);
  const fills = positions.reduce((s, p) => s + p.stats.fills, 0);
  const parts = [
    { k: "In curves", v: inCurves, c: "bg-white" },
    { k: "In book", v: inBook, c: "bg-white/45" },
    { k: "In wallet", v: inWallet, c: "bg-white/15" },
  ];

  return (
    <>
      {isDemo && (
        <div className="rise mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[12px]">
          <span className="flex items-center gap-2 text-white/70"><Eye size={14} />You are viewing <span className="num text-white">{DEMO_ACCOUNT}</span>. Nothing here is signed or sent.</span>
          <div className="flex gap-2"><Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => setDemo(false)}>Exit demo</Btn><Btn className="h-8 px-3 text-[12px]" onClick={connect}>Connect wallet</Btn></div>
        </div>
      )}
      <PageHead title="Portfolio" sub={<>Valued at the current mid price of <span className="num text-white/80">{mid.toFixed(4)}</span> {m.quoteSymbol}.</>} />
      {error && live && <div className="mb-5"><Notice tone="error" title="Could not load your data">{error.message}</Notice></div>}

      {loading && live && !chain ? <Skeleton className="mb-4 h-40" /> : data && (
        <section className="panel mb-4 rounded-2xl p-5">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_2fr]">
            <div>
              <p className="label">Net value</p>
              <p className="num mt-2 text-[40px] font-medium leading-none tracking-tight">{total.toFixed(2)}<span className="ml-2 text-[14px] text-white/40">{m.quoteSymbol}</span></p>
              <p className="mt-3 flex items-center gap-2 text-[12px]">
                <span className={cx("num rounded-full px-2 py-0.5", pnl >= 0 ? "bg-bid/10 text-bid" : "bg-ask/10 text-ask")}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}</span>
                <span className="text-white/45">trading P&amp;L across {fills} fill{fills === 1 ? "" : "s"}</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {parts.map((p) => (
                <div key={p.k} className="rounded-xl bg-white/[0.025] p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] text-white/45"><span className={cx("h-1.5 w-1.5 rounded-full", p.c)} />{p.k}</p>
                  <p className="num mt-2 text-[17px]">{p.v.toFixed(2)}</p>
                  <p className="num mt-0.5 text-[10.5px] text-white/35">{total ? ((p.v / total) * 100).toFixed(1) : 0}%</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full">
            {parts.map((p) => <span key={p.k} className={cx("h-full transition-all duration-700", p.c)} style={{ width: `${total ? (p.v / total) * 100 : 0}%` }} />)}
          </div>
          <p className="mt-3 text-[11px] text-white/35">NEAR for gas and storage: <span className="num text-white/60">{fmtNear(data.near)} NEAR</span></p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-medium text-white/90">Open curves <span className="num ml-1 text-white/40">{positions.length}</span></h2>
            <Link href="/make" className="text-[12px] text-white/60 hover:text-white">+ New curve</Link>
          </div>
          {loading && live && !chain ? <Skeleton className="h-48" /> : positions.length === 0 ? (
            <Card><p className="text-[13px] text-white/55">No open curves yet. <Link href="/make" className="text-white underline-offset-2 hover:underline">Publish one</Link> and it will show up here.</p></Card>
          ) : (
            <div className="space-y-3">{positions.map((p) => <Position key={p.position_id} p={p} m={m} mid={mid} demo={isDemo} onClose={() => setClosing(p)} />)}</div>
          )}
        </div>

        <div className="min-w-0">
          <h2 className="mb-3 text-[14px] font-medium text-white/90">Balances</h2>
          {data && (
            <Card pad={false}>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[400px] text-[12.5px]">
                  <thead><tr className="text-[10.5px] uppercase tracking-wider text-white/35"><th className="py-2.5 pl-4 text-left font-normal">Token</th><th className="py-2.5 pr-3 text-right font-normal">Wallet</th><th className="py-2.5 pr-3 text-right font-normal">In book</th><th className="py-2.5 pr-4 text-right font-normal">Withdraw</th></tr></thead>
                  <tbody>
                    <WithdrawRow symbol={m.baseSymbol} token={m.base} decimals={m.base_decimals} wallet={data.wb} internal={data.ib} demo={isDemo} />
                    <WithdrawRow symbol={m.quoteSymbol} token={m.quote} decimals={m.quote_decimals} wallet={data.wq} internal={data.iq} demo={isDemo} />
                  </tbody>
                </table>
              </div>
              <p className="border-t border-white/[0.05] px-4 py-3 text-[11px] leading-relaxed text-white/35">Closing a curve returns what is left to your book balance. Withdraw moves it to your wallet.</p>
            </Card>
          )}
        </div>
      </div>

      {closing && (
        <div role="dialog" aria-modal="true" aria-labelledby="close-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="panel rise w-full max-w-sm rounded-2xl p-6">
            <h3 id="close-title" className="text-[16px] font-medium">Close position #{closing.position_id}?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/60">What is left returns to your book balance and the 0.01 NEAR storage deposit is refunded. You can withdraw afterwards.</p>
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
