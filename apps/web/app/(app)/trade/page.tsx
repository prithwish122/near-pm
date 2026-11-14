"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ChevronDown, RefreshCw, Zap } from "lucide-react";
import LiquidityChart from "@/components/app/LiquidityChart";
import OrderBook from "@/components/app/OrderBook";
import { makerColors } from "@/components/app/palette";
import { Btn, Card, Notice, Seg, Skeleton, cx } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { ApiError, getCurves, getMarkets, postQuote, type Quote } from "@/lib/api";
import { TICKS, compact, tickDigits, toLevels, type Level } from "@/lib/book";
import { BOOK, MARKETS, accountUrl } from "@/lib/config";
import { amountProblem, fmtUnits, parseAmount, shortAccount, timeAgo } from "@/lib/format";
import { formatUnits } from "@ebbflow/curve-math";
import { checkRegistration, registrationTxs } from "@/lib/registration";
import { ftBalance, view } from "@/lib/rpc";
import { swapTx } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";
import { useSeed } from "@/lib/seed";

const SLIPPAGE = [10, 50, 100];
const SHAPES = ["Flat", "Gentle", "Steep", "Sharp"];

interface Fill { maker_id: string; taker_id: string; side: "buy_base" | "sell_base"; base_amount: string; quote_amount: string; timestamp_ms: number }

function TokenPair({ base, quote }: { base: string; quote: string }) {
  return (
    <span className="relative flex h-8 w-12 shrink-0" aria-hidden>
      <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-white to-[#9adfc0] text-[11px] font-bold text-ink ring-2 ring-[#111113]">{base[0] === "w" ? "N" : base[0]}</span>
      <span className="absolute left-4 top-0 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#4aa3ff] to-[#1f5fd1] text-[11px] font-bold text-white ring-2 ring-[#111113]">$</span>
    </span>
  );
}

/** Mid price that flashes green or red when it moves, like an exchange ticker. */
function LivePrice({ value }: { value: number | null }) {
  const prev = useRef<number | null>(null);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value != null && prev.current != null && value !== prev.current) { setDir(value > prev.current ? "up" : "down"); setN((x) => x + 1); }
    prev.current = value;
  }, [value]);
  return (
    <span key={n} className={cx("num rounded px-1 text-[22px] font-semibold leading-none tracking-tight", dir === "up" ? "flash-up text-bid" : dir === "down" ? "flash-down text-ask" : "text-white")}>
      {value != null ? value.toFixed(4) : "—"}
    </span>
  );
}

export default function TradePage() {
  const m = MARKETS[0]!;
  const { accountId, connect, send, ready } = useWallet();
  const [side, setSide] = useState<"buy_base" | "sell_base">("buy_base");
  const [mode, setMode] = useState<"base" | "quote">("base");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(50);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<ApiError | null>(null);
  const [qLoading, setQLoading] = useState(false);
  const [bump, setBump] = useState(0);
  const [bookTab, setBookTab] = useState<"book" | "trades">("book");
  const [tick, setTick] = useState(0.005);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const buy = side === "buy_base";
  const inSym = buy ? m.quoteSymbol : m.baseSymbol;
  const outSym = buy ? m.baseSymbol : m.quoteSymbol;
  const inToken = buy ? m.quote : m.base;
  const inDec = buy ? m.quote_decimals : m.base_decimals;
  const unit = mode === "base" ? m.baseSymbol : m.quoteSymbol;

  // first render uses the snapshot sent with the page; polling refreshes it
  const seed = useSeed();
  const markets = usePolling(getMarkets, [], 5000, seed.markets);
  const curves = usePolling(() => getCurves(m.market_id, 40), [], 5000, seed.curves?.market_id === m.market_id ? seed.curves : null);
  const bal = usePolling(() => (accountId ? ftBalance(inToken, accountId) : Promise.resolve(null)), [accountId, inToken], 8000);
  const row = markets.data?.find((r) => r.market_id === m.market_id);

  useEffect(() => {
    const h = () => setBump((b) => b + 1);
    window.addEventListener("ebbflow:requote", h);
    return () => window.removeEventListener("ebbflow:requote", h);
  }, []);

  const amountIssue = amountProblem(amount, mode === "base" ? m.base_decimals : m.quote_decimals);
  // Debounced quote (300 ms).
  useEffect(() => {
    setQuote(null);
    setQErr(null);
    const n = parseAmount(amount, mode === "base" ? m.base_decimals : m.quote_decimals);
    if (!n || n === 0n) { setQLoading(false); return; }
    setQLoading(true);
    let live = true;
    const t = setTimeout(async () => {
      try {
        const q = await postQuote({
          market_id: m.market_id, side, slippage_bps: slippage, taker: accountId ?? undefined,
          ...(mode === "base" ? { base_amount: amount.trim() } : { quote_amount: amount.trim() }),
        });
        if (live) setQuote(q);
      } catch (e) {
        if (live) setQErr(e instanceof ApiError ? e : new ApiError(0, "ERROR", String(e)));
      } finally {
        if (live) setQLoading(false);
      }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [amount, mode, side, slippage, accountId, bump, m]);

  const flip = (s: typeof side) => { setSide(s); if (s === "sell_base") setMode("base"); };

  // ---------- book ----------
  const bestAsk = row?.best_ask != null ? Number(row.best_ask) : null;
  const bestBid = row?.best_bid != null ? Number(row.best_bid) : null;
  const mid = bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : bestAsk ?? bestBid;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const spreadPct = spread != null && mid ? (spread / mid) * 100 : null;
  const askLv = useMemo(() => toLevels(curves.data?.depth.asks ?? [], "ask", tick, 14), [curves.data, tick]);
  const bidLv = useMemo(() => toLevels(curves.data?.depth.bids ?? [], "bid", tick, 14), [curves.data, tick]);
  const color = useMemo(() => makerColors(curves.data?.positions.map((p) => p.owner_id) ?? []), [curves.data]);

  const pick = (s: "ask" | "bid", l: Level) => {
    flip(s === "ask" ? "buy_base" : "sell_base");
    setMode("base");
    setAmount(String(+l.total.toFixed(4)));
  };

  // ---------- trades (on-chain fill ring buffer) ----------
  const fills = usePolling(() => view<Fill[]>(BOOK, "get_recent_fills", { limit: 40 }), [], 8000);

  // ---------- ticket ----------
  const maxIn = quote ? BigInt(quote.tx.args.amount) : 0n;
  const insufficient = !!accountId && bal.data != null && quote != null && bal.data < maxIn;
  const needsReg = quote?.warnings.includes("recipient_not_registered_with_output_token");
  const pctable = !!accountId && bal.data != null && ((buy && mode === "quote") || !buy);
  const setPct = (p: number) => { if (bal.data == null) return; setAmount(formatUnits((bal.data * BigInt(p)) / 100n, inDec, buy ? 2 : 4)); };
  const payBox = buy && mode === "base";
  const fillTo = quote?.legs.length ? (buy ? Math.max(...quote.legs.map((l) => Number(l.new_price))) : Math.min(...quote.legs.map((l) => Number(l.new_price)))) : null;
  const legTotal = quote ? quote.legs.reduce((s, l) => s + Number(l.base_amount), 0) || 1 : 1;

  const execute = async () => {
    if (!accountId) return connect();
    if (!quote) return;
    setSending(true);
    setSendErr(null);
    try { await send([swapTx(quote.tx)]); } catch (e) { setSendErr(e instanceof Error ? e.message : String(e)); } finally { setSending(false); }
  };

  const registerOutput = async () => {
    if (!accountId) return;
    const outToken = buy ? m.base : m.quote;
    const checks = (await checkRegistration(accountId)).filter((c) => c.contract === outToken);
    const txs = registrationTxs(accountId, checks);
    if (txs.length) await send(txs).catch((e) => setSendErr(String(e.message ?? e)));
  };

  const solverDown = qErr?.code === "SOLVER_UNREACHABLE" || (curves.error instanceof ApiError && curves.error.code === "SOLVER_UNREACHABLE");
  const live = !!curves.data && !solverDown;
  const digits = tickDigits(tick) + 1;

  return (
    <div className="space-y-3">
      {/* Ticker strip */}
      <section className="panel flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl px-4 py-3">
        <button className="flex items-center gap-3 rounded-xl py-1 pr-2 text-left transition hover:bg-white/[0.04]" aria-label="Market">
          <TokenPair base={m.baseSymbol} quote={m.quoteSymbol} />
          <span>
            <span className="flex items-center gap-1 text-[15px] font-semibold">{m.baseSymbol}<span className="text-white/35">/</span>{m.quoteSymbol}<ChevronDown size={14} className="text-white/40" /></span>
            <span className="text-[11px] text-white/40">Curve book · NEAR testnet</span>
          </span>
        </button>
        <div className="flex flex-col"><span className="label">Mid price</span><LivePrice value={mid ?? null} /></div>
        <div className="flex flex-1 flex-wrap gap-x-7 gap-y-3">
          {[
            ["Best bid", bestBid?.toFixed(4) ?? "—", "bid"],
            ["Best ask", bestAsk?.toFixed(4) ?? "—", "ask"],
            ["Spread", spreadPct != null ? `${spreadPct.toFixed(2)}%` : "—", ""],
            ["Ask depth", row ? `${compact(Number(row.depth_base_ask))} ${m.baseSymbol}` : "—", ""],
            ["Bid depth", row ? `${compact(Number(row.depth_quote_bid))} ${m.quoteSymbol}` : "—", ""],
            ["Makers", row?.positions ?? "—", ""],
          ].map(([l, v, t]) => (
            <div key={l as string} className="shrink-0">
              <p className="label whitespace-nowrap">{l}</p>
              <div className={cx("num mt-1 whitespace-nowrap text-[13px]", t === "bid" ? "text-bid" : t === "ask" ? "text-ask" : "text-white/90")}>{markets.loading && !row ? <Skeleton className="h-4 w-14" /> : v}</div>
            </div>
          ))}
        </div>
        <span className={cx("hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] xl:flex", live ? "border-bid/25 text-bid" : "border-ask/30 text-ask")}>
          {live ? <span className="live-dot" /> : <span className="h-[7px] w-[7px] rounded-full bg-ask" />}{live ? "Live" : "Offline"}
        </span>
      </section>

      {solverDown && (
        <Notice tone="error" title="Solver unreachable" action={<Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => { void markets.refresh(); void curves.refresh(); setBump((b) => b + 1); }}><RefreshCw size={12} />Retry</Btn>}>
          The quote service is not responding, so the book and quotes are unavailable. Start it with <code className="rounded bg-white/10 px-1">pnpm solver</code> or set NEXT_PUBLIC_SOLVER_URL.
        </Notice>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_300px_360px]">
        {/* Liquidity */}
        <section className="panel flex min-h-[420px] min-w-0 flex-col rounded-2xl lg:col-start-1 lg:row-start-1">
          <header className="flex items-start justify-between gap-4 px-5 pt-4">
            <div>
              <h2 className="text-[13px] font-medium text-white/90">Liquidity by price</h2>
              <p className="mt-0.5 text-[11.5px] text-white/40">Every maker&apos;s curve, summed and sliced. Hover a slice for its size.</p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-white/45">
              <span className="flex items-center gap-1.5"><span className="h-[2px] w-3 rounded bg-bid" />Bids</span>
              <span className="flex items-center gap-1.5"><span className="h-[2px] w-3 rounded bg-ask" />Asks</span>
            </div>
          </header>
          <div className="flex-1 px-3 pb-3 pt-2">
            {curves.loading && !curves.data ? <Skeleton className="h-full min-h-[300px]" /> : curves.data && !curves.data.positions.length ? (
              <div className="grid h-full min-h-[300px] place-items-center text-[12px] text-white/45"><span>No makers yet. <Link href="/make" className="text-white underline-offset-2 hover:underline">Be the first maker</Link></span></div>
            ) : (
              <LiquidityChart bids={curves.data?.depth.bids ?? []} asks={curves.data?.depth.asks ?? []} mid={mid} baseSymbol={m.baseSymbol} quoteSymbol={m.quoteSymbol}
                fill={fillTo != null ? { side: buy ? "ask" : "bid", to: fillTo, label: `Your order fills to ${fillTo.toFixed(4)}` } : null}
                bidCaption={row ? `Best bid · ${compact(Number(row.depth_quote_bid))} ${m.quoteSymbol} deep` : undefined}
                askCaption={row ? `Best ask · ${compact(Number(row.depth_base_ask))} ${m.baseSymbol} deep` : undefined} />
            )}
          </div>
        </section>

        {/* Order book / trades */}
        <section className="panel min-w-0 rounded-2xl lg:col-start-1 xl:col-start-2 xl:row-start-1">
          <header className="flex min-h-[46px] items-center justify-between gap-2 border-b border-white/[0.06] px-3">
            <Seg size="xs" label="Book or trades" value={bookTab} onChange={setBookTab} options={[{ value: "book", label: "Order book" }, { value: "trades", label: "Trades" }]} />
            {bookTab === "book" && (
              <select aria-label="Tick size" value={tick} onChange={(e) => setTick(Number(e.target.value))} className="num rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white outline-none">
                {TICKS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </header>
          {bookTab === "book" ? (
            <>
              {curves.loading && !curves.data ? <div className="space-y-1.5 p-3">{Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="h-4" />)}</div> : (
                <OrderBook asks={askLv} bids={bidLv} digits={digits} baseSymbol={m.baseSymbol} spread={spread} spreadPct={spreadPct} onPick={pick} rows={10} fillTo={fillTo} fillSide={buy ? "ask" : "bid"} />
              )}
              <p className="border-t border-white/[0.06] px-3 py-2 text-[10.5px] text-white/35">Rows are slices of maker curves. Click one to fill through it.</p>
            </>
          ) : (
            <div className="text-[12px]">
              <div className="grid grid-cols-3 px-3 pb-1.5 pt-2 text-right text-[10.5px] text-white/40"><span className="text-left">Price</span><span>Size ({m.baseSymbol})</span><span>Time</span></div>
              {fills.loading && !fills.data ? <div className="space-y-1.5 p-3">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-4" />)}</div> : !fills.data?.length ? <p className="py-10 text-center text-white/40">No trades yet</p> : (
                fills.data.map((f, i) => {
                  const base = Number(f.base_amount) / 10 ** m.base_decimals;
                  const px = base ? Number(f.quote_amount) / 10 ** m.quote_decimals / base : 0;
                  return (
                    <a key={`${f.timestamp_ms}-${i}`} href={accountUrl(f.taker_id)} target="_blank" rel="noreferrer" className="grid grid-cols-3 px-3 py-[3px] text-right transition-colors hover:bg-white/[0.04]" title={`${f.taker_id} filled against ${f.maker_id}`}>
                      <span className={cx("num text-left", f.side === "buy_base" ? "text-bid" : "text-ask")}>{px.toFixed(4)}</span>
                      <span className="num text-white/80">{compact(base)}</span>
                      <span className="text-white/40">{timeAgo(f.timestamp_ms)}</span>
                    </a>
                  );
                })
              )}
            </div>
          )}
        </section>

        {/* Ticket */}
        <section className="panel order-first min-w-0 rounded-2xl p-4 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3 xl:row-span-1">
          <div role="tablist" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1">
            {(["buy_base", "sell_base"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={side === s} onClick={() => flip(s)}
                className={cx("rounded-lg py-2 text-[13px] font-semibold transition", side === s ? (s === "buy_base" ? "bg-bid text-ink" : "bg-ask text-white") : "text-white/50 hover:text-white")}>
                {s === "buy_base" ? "Buy" : "Sell"} {m.baseSymbol}
              </button>
            ))}
          </div>

          {buy && (
            <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
              <span>Enter amount in</span>
              <Seg size="xs" label="Amount in" value={mode} onChange={(v) => { setMode(v); setAmount(""); }} options={[{ value: "base", label: m.baseSymbol }, { value: "quote", label: m.quoteSymbol }]} />
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-white/[0.08] bg-black/40 p-3.5 transition focus-within:border-accent/50">
            <div className="flex items-center justify-between text-[11px] text-white/45">
              <label htmlFor="amt">{mode === "base" ? (buy ? "You buy" : "You sell") : "You spend at most"}</label>
              {accountId && bal.data != null && <span>Available <span className="num text-white/75">{fmtUnits(bal.data, inDec, 4)}</span> {inSym}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input id="amt" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00"
                className="num w-full min-w-0 bg-transparent text-[26px] font-medium text-white outline-none placeholder:text-white/20" />
              <span className="shrink-0 rounded-lg bg-white/[0.07] px-2.5 py-1 text-[12px] font-medium">{unit}</span>
            </div>
            {pctable && (
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)} className="rounded-md border border-white/[0.07] py-1 text-[11px] text-white/60 transition hover:border-white/20 hover:text-white">{p === 100 ? "Max" : `${p}%`}</button>)}
              </div>
            )}
          </div>

          <div className="relative my-[-10px] flex justify-center"><span className="z-10 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-[#18181b] text-white/50"><ArrowDownUp size={14} /></span></div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5" aria-live="polite">
            <p className="text-[11px] text-white/45">{payBox ? "You pay" : "You receive"}</p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {qLoading ? <Skeleton className="h-8 w-36" /> : <span className={cx("num truncate text-[26px] font-medium", quote ? "text-white" : "text-white/20")}>{quote ? (payBox ? quote.amount_in : quote.amount_out) : "0.00"}</span>}
              <span className="shrink-0 rounded-lg bg-white/[0.07] px-2.5 py-1 text-[12px] font-medium">{payBox ? m.quoteSymbol : outSym}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11.5px] text-white/50">
            <span>Max slippage</span>
            <Seg size="xs" label="Slippage" value={String(slippage)} onChange={(v) => setSlippage(Number(v))} options={SLIPPAGE.map((s) => ({ value: String(s), label: `${s / 100}%` }))} />
          </div>

          {/* Route */}
          <div className="mt-3 min-h-[86px] rounded-xl border border-white/[0.06] p-3">
            {qLoading ? <div className="space-y-2"><Skeleton className="h-2.5" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div> : quote ? (
              <div className="rise">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-white/55"><Zap size={12} className="text-accent" />Split across {quote.legs.length} maker{quote.legs.length > 1 ? "s" : ""}</span>
                  <span className={cx("num", quote.price_impact_bps > 100 ? "text-amber-300" : "text-white/55")}>{(quote.price_impact_bps / 100).toFixed(2)}% impact</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  {quote.legs.map((l) => <span key={l.position_id} className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full" style={{ width: `${(Number(l.base_amount) / legTotal) * 100}%`, background: color(l.maker) }} />)}
                </div>
                <ul className="mt-2.5 space-y-1 text-[11.5px]">
                  {quote.legs.map((l) => (
                    <li key={l.position_id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-white/70"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color(l.maker) }} /><span className="truncate">{shortAccount(l.maker, 20)}</span></span>
                      {Number(l.base_amount) === 0 ? <span className="text-white/40">dust</span> : <span className="num shrink-0 text-white/80">{l.base_amount} @ {l.avg_price}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : qErr ? (
              qErr.code === "INSUFFICIENT_LIQUIDITY" ? <p className="text-[12px] text-amber-200">Not enough liquidity. {qErr.availableRaw ? `Max available: ${fmtUnits(qErr.availableRaw, m.base_decimals, 4)} ${m.baseSymbol}.` : ""}</p>
              : qErr.code === "SOLVER_UNREACHABLE" ? <p className="text-[12px] text-white/50">Quote unavailable while the solver is offline.</p>
              : <p className="text-[12px] text-rose-300">{qErr.message}</p>
            ) : amountIssue ? <p role="alert" className="pt-3 text-center text-[12px] text-rose-300">{amountIssue}</p>
            : <p className="pt-3 text-center text-[12px] text-white/40">Enter an amount, or click a row in the book.<br />The route across makers shows here.</p>}
          </div>

          {quote && (
            <dl className="rise mt-3 space-y-1.5 text-[11.5px]">
              {[
                ["Average price", quote.avg_price],
                [`You ${buy ? "pay" : "sell"}`, `${quote.amount_in} ${inSym}`],
                [buy ? "Max spend (on-chain limit)" : "Min receive (on-chain limit)", `${buy ? quote.amount_in_max : quote.min_amount_out} ${buy ? inSym : outSym}`],
                ["Settlement", "1 tx · all or nothing"],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-white/45">{k}</dt><dd className="num text-right text-white/85">{v}</dd></div>)}
            </dl>
          )}

          {needsReg && (
            <div className="mt-3"><Notice tone="warn" title={`Not registered with ${outSym}`} action={<Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={registerOutput}>Register</Btn>}>
              Your payout will be credited to your Ebbflow balance instead (withdrawable from Portfolio).
            </Notice></div>
          )}
          {insufficient && <p className="mt-3 text-[12px] text-amber-200">Insufficient {inSym}. <Link href="/faucet" className="underline underline-offset-2">Get some from the faucet</Link>.</p>}
          {sendErr && <p role="alert" className="mt-3 text-[12px] text-rose-300">{sendErr}</p>}

          <Btn variant={!accountId ? "primary" : buy ? "buy" : "sell"} className="mt-4 h-12 w-full text-[14px]" onClick={execute} disabled={sending || !ready || (!!accountId && (!quote || insufficient))}>
            {!accountId ? "Connect wallet to trade" : sending ? "Waiting for wallet…" : quote ? `${buy ? "Buy" : "Sell"} ${buy ? quote.amount_out : quote.amount_in} ${m.baseSymbol}` : `${buy ? "Buy" : "Sell"} ${m.baseSymbol}`}
          </Btn>
          <p className="mt-2 text-center text-[10.5px] text-white/35">Your limit is enforced on-chain. A stale route can only refund you.</p>
        </section>

        {/* Makers */}
        <Card pad={false} className="min-w-0 lg:col-start-1 xl:col-span-2" title={<span>Makers on the book <span className="num ml-1 text-white/40">{curves.data?.positions.length ?? ""}</span></span>}
          aside={<Link href="/make" className="text-[12px] text-accent hover:underline">+ Publish a curve</Link>}>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-white/35">
                {["Maker", "Side", "Shape", "Price range", "Size", ""].map((h, i) => <th key={i} className={cx("px-4 py-2.5 font-normal", i >= 3 && "text-right")}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(curves.data?.positions ?? []).map((p) => {
                  const first = p.points[0], last = p.points[p.points.length - 1];
                  const routed = quote?.legs.some((l) => l.position_id === p.position_id) && p.side === (buy ? "ask" : "bid");
                  return (
                    <tr key={`${p.side}-${p.position_id}`} className={cx("border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]", routed && "bg-accent/[0.04]")}>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: color(p.owner_id) }} />{shortAccount(p.owner_id, 26)}<span className="num text-white/30">#{p.position_id}</span></span></td>
                      <td className="px-4 py-2.5"><span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-medium", p.side === "ask" ? "bg-ask/10 text-ask" : "bg-bid/10 text-bid")}>{p.side === "ask" ? "Ask" : "Bid"}</span></td>
                      <td className="px-4 py-2.5 text-white/70">{first && last && first.price === last.price ? "Limit" : SHAPES[p.alpha] ?? `α ${p.alpha}`}</td>
                      <td className="num px-4 py-2.5 text-right text-white/80">{first?.price.toFixed(4)} → {last?.price.toFixed(4)}</td>
                      <td className="num px-4 py-2.5 text-right">{last ? compact(last.base) : "—"} <span className="text-white/40">{m.baseSymbol}</span></td>
                      <td className="px-4 py-2.5 text-right">{routed && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] text-accent">In your route</span>}</td>
                    </tr>
                  );
                })}
                {curves.data && !curves.data.positions.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-white/40">No makers yet.</td></tr>}
                {!curves.data && <tr><td colSpan={6} className="p-4"><Skeleton className="h-16" /></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
