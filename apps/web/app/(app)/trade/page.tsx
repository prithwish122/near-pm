"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import DepthPlot, { type Series } from "@/components/app/DepthPlot";
import { makerColors } from "@/components/app/palette";
import { Btn, Card, Field, Notice, PageHead, Seg, Skeleton, Stat } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { ApiError, getCurves, getMarkets, postQuote, type Quote } from "@/lib/api";
import { MARKETS } from "@/lib/config";
import { amountProblem, fmtUnits, parseAmount, shortAccount } from "@/lib/format";
import { checkRegistration, registrationTxs } from "@/lib/registration";
import { ftBalance } from "@/lib/rpc";
import { swapTx } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";

const SLIPPAGE = [10, 50, 100];

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
  const [view, setView] = useState<"auto" | "asks" | "bids" | "both">("auto");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const buy = side === "buy_base";
  const inSym = buy ? m.quoteSymbol : m.baseSymbol;
  const outSym = buy ? m.baseSymbol : m.quoteSymbol;
  const inToken = buy ? m.quote : m.base;
  const inDec = buy ? m.quote_decimals : m.base_decimals;
  const unit = mode === "base" ? m.baseSymbol : m.quoteSymbol;

  const markets = usePolling(getMarkets, [], 5000);
  const curves = usePolling(() => getCurves(m.market_id, 40), [], 5000);
  const bal = usePolling(() => (accountId ? ftBalance(inToken, accountId) : Promise.resolve(null)), [accountId, inToken], 8000);
  const row = markets.data?.find((r) => r.market_id === m.market_id);

  // Re-quote after a stale-route refund, or when the book changes after a transaction.
  useEffect(() => {
    const h = () => setBump((b) => b + 1);
    window.addEventListener("ebbflow:requote", h);
    return () => window.removeEventListener("ebbflow:requote", h);
  }, []);

  // Debounced quote (300 ms).
  const amountIssue = amountProblem(amount, mode === "base" ? m.base_decimals : m.quote_decimals);
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
          market_id: m.market_id,
          side,
          slippage_bps: slippage,
          taker: accountId ?? undefined,
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

  const flip = (s: typeof side) => { setSide(s); setView("auto"); if (s === "sell_base") setMode("base"); };

  const shown = view === "auto" ? (buy ? "asks" : "bids") : view;
  const chart = useMemo<Series[]>(() => {
    const c = curves.data;
    if (!c) return [];
    const color = makerColors(c.positions.map((p) => p.owner_id));
    const inRoute = new Set(quote?.legs.map((l) => l.position_id));
    const out: Series[] = c.positions.map((p) => ({
      key: `${p.side}-${p.position_id}`,
      label: `${shortAccount(p.owner_id, 22)} ${p.side}`,
      color: color(p.owner_id),
      dash: p.side === "bid",
      area: true,
      width: inRoute.has(p.position_id) && p.side === (buy ? "ask" : "bid") ? 3.5 : 1.8,
      pts: p.points.map((q) => [q.price, q.base] as [number, number]).sort((a, b) => a[0] - b[0]),
    }));
    if (c.depth.asks.length) out.push({ key: "tot-ask", label: "Total ask depth", color: "#ffffff", width: 1.2, dash: true, pts: c.depth.asks.map((q) => [q.price, q.base]) });
    if (c.depth.bids.length) out.push({ key: "tot-bid", label: "Total bid depth", color: "#9fb8ab", width: 1.2, dash: true, pts: c.depth.bids.map((q) => [q.price, q.base] as [number, number]).sort((a, b) => a[0] - b[0]) });
    return out.filter((s) => shown === "both" || (shown === "asks" ? s.key.startsWith("ask-") || s.key === "tot-ask" : s.key.startsWith("bid-") || s.key === "tot-bid"));
  }, [curves.data, quote, buy, shown]);

  const maxIn = quote ? BigInt(quote.tx.args.amount) : 0n;
  const insufficient = !!accountId && bal.data != null && quote != null && bal.data < maxIn;
  const needsReg = quote?.warnings.includes("recipient_not_registered_with_output_token");

  const execute = async () => {
    if (!accountId) return connect();
    if (!quote) return;
    setSending(true);
    setSendErr(null);
    try {
      await send([swapTx(quote.tx)]);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const registerOutput = async () => {
    if (!accountId) return;
    const outToken = buy ? m.base : m.quote;
    const checks = (await checkRegistration(accountId)).filter((c) => c.contract === outToken);
    const txs = registrationTxs(accountId, checks);
    if (txs.length) await send(txs).catch((e) => setSendErr(String(e.message ?? e)));
  };

  const solverDown = qErr?.code === "SOLVER_UNREACHABLE" || curves.error instanceof ApiError && curves.error.code === "SOLVER_UNREACHABLE";

  return (
    <>
      <PageHead title="Trade" sub="One signature fills across many makers, all or nothing. Your limit is enforced on-chain, so a stale quote can only cause a refund." />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/45">Market</p>
            <label className="sr-only" htmlFor="market">Market</label>
            <select id="market" className="mt-1 rounded-lg border border-white/10 bg-[#0f2a1c] px-3 py-2 text-sm" defaultValue={0} aria-label="Market">
              {MARKETS.map((x) => <option key={x.market_id} value={x.market_id}>{x.baseSymbol} / {x.quoteSymbol}</option>)}
            </select>
          </div>
          <Stat label="Best bid" value={row?.best_bid ?? (markets.loading ? "…" : "—")} />
          <Stat label="Best ask" value={row?.best_ask ?? (markets.loading ? "…" : "—")} />
          <Stat label="Ask depth" value={row ? `${row.depth_base_ask}` : "…"} sub={m.baseSymbol} />
          <Stat label="Bid depth" value={row ? `${row.depth_quote_bid}` : "…"} sub={m.quoteSymbol} />
          <Stat label="Positions" value={row?.positions ?? "…"} />
        </div>
      </Card>

      {solverDown && (
        <div className="mb-5"><Notice tone="error" title="Solver unreachable" action={<Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => { void markets.refresh(); void curves.refresh(); setBump((b) => b + 1); }}><RefreshCw size={12} />Retry</Btn>}>
          The quote service is not responding. Start it with <code className="rounded bg-white/10 px-1">pnpm solver</code> or set NEXT_PUBLIC_SOLVER_URL.
        </Notice></div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card title="Aggregated depth" aside={<Seg label="Chart side" value={shown} onChange={setView} options={[{ value: "asks", label: "Asks" }, { value: "bids", label: "Bids" }, { value: "both", label: "Both" }]} />}>
          {curves.loading && !curves.data ? <Skeleton className="h-[260px]" /> : (
            <DepthPlot series={chart} xLabel={`Price (${m.quoteSymbol} per ${m.baseSymbol})`} yLabel={`Cumulative ${m.baseSymbol}`} empty="No makers yet. Be the first maker." />
          )}
          {curves.data && curves.data.positions.length === 0 && <p className="mt-3 text-center text-[12px] text-white/55"><Link href="/make" className="underline underline-offset-2">Be the first maker →</Link></p>}
        </Card>

        <Card title="Swap">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg label="Side" value={side} onChange={flip} options={[{ value: "buy_base", label: "Buy" }, { value: "sell_base", label: "Sell" }]} />
            {buy && <Seg label="Amount in" value={mode} onChange={(v) => { setMode(v); setAmount(""); }} options={[{ value: "base", label: `Get ${m.baseSymbol}` }, { value: "quote", label: `Spend ${m.quoteSymbol}` }]} />}
          </div>

          <Field className="mt-4" label={mode === "base" ? `${buy ? "Buy" : "Sell"} amount` : "Spend at most"} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" suffix={unit}
            hint={accountId && bal.data != null ? `Balance: ${fmtUnits(bal.data, inDec, 4)} ${inSym}` : undefined} />

          <div className="mt-4 flex items-center gap-3 text-[12px] text-white/60">
            <span>Max slippage</span>
            <Seg label="Slippage" value={String(slippage)} onChange={(v) => setSlippage(Number(v))} options={SLIPPAGE.map((s) => ({ value: String(s), label: `${s / 100}%` }))} />
          </div>

          <div className="mt-4 rounded-xl bg-white/[0.05] p-4" aria-live="polite">
            {qLoading ? <Skeleton className="h-24" /> : quote ? (
              <>
                <p className="text-[10px] uppercase tracking-wider text-white/45">Route · {quote.legs.length} maker{quote.legs.length > 1 ? "s" : ""}</p>
                <ul className="mt-2 space-y-1.5 text-[12px]">
                  {quote.legs.map((l) => (
                    <li key={l.position_id} className="flex justify-between gap-3 tabular-nums"><span className="truncate text-white/80">{shortAccount(l.maker, 22)}</span>{Number(l.base_amount) === 0 ? <span className="text-white/45" title="Residual dust left on this order">dust (&lt;0.000001 {m.baseSymbol})</span> : <span>{l.base_amount} {m.baseSymbol} @ {l.avg_price}</span>}</li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[12px] tabular-nums">
                  <div className="flex justify-between"><dt className="text-white/55">You {buy ? "pay" : "sell"}</dt><dd>{quote.amount_in} {inSym}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/55">You receive</dt><dd>{quote.amount_out} {outSym}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/55">Average price</dt><dd>{quote.avg_price}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/55">Price impact</dt><dd>{quote.price_impact_bps} bps</dd></div>
                  <div className="flex justify-between"><dt className="text-white/55">{buy ? "Max spend" : "Min receive"} (on-chain limit)</dt><dd>{buy ? quote.amount_in_max : quote.min_amount_out} {buy ? inSym : outSym}</dd></div>
                </dl>
              </>
            ) : qErr ? (
              qErr.code === "INSUFFICIENT_LIQUIDITY" ? (
                <p className="text-[12px] text-amber-200">Not enough liquidity. {qErr.availableRaw ? `Max available: ${fmtUnits(qErr.availableRaw, m.base_decimals, 4)} ${m.baseSymbol}.` : ""}</p>
              ) : qErr.code === "SOLVER_UNREACHABLE" ? <p className="text-[12px] text-white/55">Quote unavailable.</p>
              : <p className="text-[12px] text-rose-300">{qErr.message}</p>
            ) : amountIssue ? <p role="alert" className="text-[12px] text-rose-300">{amountIssue}</p>
            : <p className="text-[12px] text-white/50">Enter an amount to see the route.</p>}
          </div>

          {needsReg && (
            <div className="mt-3"><Notice tone="warn" title={`Not registered with ${outSym}`} action={<Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={registerOutput}>Register</Btn>}>
              Your payout will be credited to your Ebbflow balance instead (withdrawable from Portfolio). Register to receive it directly.
            </Notice></div>
          )}
          {insufficient && <p className="mt-3 text-[12px] text-amber-200">Insufficient {inSym}. <Link href="/faucet" className="underline underline-offset-2">Get some from the faucet</Link>.</p>}
          {sendErr && <p role="alert" className="mt-3 text-[12px] text-rose-300">{sendErr}</p>}

          <Btn className="mt-4 w-full" onClick={execute} disabled={sending || !ready || (!!accountId && (!quote || insufficient))}>
            {!accountId ? "Connect wallet to trade" : sending ? "Waiting for wallet…" : <>Execute (1 tx) <ArrowRight size={14} /></>}
          </Btn>
          <p className="mt-2 text-center text-[11px] text-white/40">One ft_transfer_call. All legs fill in a single receipt, or you are refunded.</p>
        </Card>
      </div>
    </>
  );
}
