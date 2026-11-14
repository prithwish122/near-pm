"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Minus, Plus, RefreshCw } from "lucide-react";
import LiquidityChart from "@/components/app/LiquidityChart";
import { Btn, Card, Notice, PageHead, cx } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { getMarkets } from "@/lib/api";
import { BOOK, HAS_FAUCET, MARKETS } from "@/lib/config";
import { parseSide, previewSide, type SideForm } from "@/lib/curvePreview";
import { fmtUnits } from "@/lib/format";
import { checkRegistration, registrationTxs } from "@/lib/registration";
import { ftBalance, view } from "@/lib/rpc";
import { createPositionTx, depositTx, type SideArgs, type TxSpec } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";
import { useSeed } from "@/lib/seed";

type Shape = 0 | 1 | 2 | 3 | "limit";
const SHAPES: { v: Shape; name: string; desc: string }[] = [
  { v: 0, name: "Flat", desc: "Even across the range" },
  { v: 1, name: "Gentle", desc: "Leans toward the price" },
  { v: 2, name: "Steep", desc: "Most size near the price" },
  { v: 3, name: "Sharp", desc: "Tight around the price" },
  { v: "limit", name: "Limit", desc: "One price per side" },
];
const RANGES = [{ k: "tight", label: "Tight", w: 0.01 }, { k: "normal", label: "Normal", w: 0.03 }, { k: "wide", label: "Wide", w: 0.08 }] as const;
const GAP = 0.008; // each side starts 0.8% away from mid

/** Little bid|ask histogram that shows a shape at a glance. */
function ShapeGlyph({ shape, on }: { shape: Shape; on: boolean }) {
  const n = 7;
  const h = (i: number) => (shape === "limit" ? (i === 0 ? 1 : 0) : Math.pow(1 - i / n, shape) * 0.9 + 0.1);
  return (
    <span className="flex h-9 items-end justify-center gap-[2px]" aria-hidden>
      {Array.from({ length: n }, (_, i) => n - 1 - i).map((i) => <span key={`b${i}`} className={cx("w-[5px] rounded-t-sm transition-all duration-500", on ? "bg-bid" : "bg-bid/40")} style={{ height: `${h(i) * 100}%` }} />)}
      <span className="mx-[3px] h-full w-px bg-white/25" />
      {Array.from({ length: n }, (_, i) => i).map((i) => <span key={`a${i}`} className={cx("w-[5px] rounded-t-sm transition-all duration-500", on ? "bg-ask" : "bg-ask/40")} style={{ height: `${h(i) * 100}%` }} />)}
    </span>
  );
}

function PriceInput({ label, value, onChange, error, disabled, mid, id }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; disabled?: boolean; mid: number | null; id: string }) {
  const n = Number(value);
  const pct = mid && n ? ((n - mid) / mid) * 100 : null;
  const step = (d: number) => onChange(Math.max(0.0001, +(n + d).toFixed(4)).toString());
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-[11px] text-white/50"><span>{label}</span>{pct != null && <span className={cx("num", pct >= 0 ? "text-ask/80" : "text-bid/80")}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>}</label>
      <div className={cx("mt-1.5 flex items-center rounded-xl border bg-black/40 transition", error ? "border-ask/60" : "border-white/[0.08] focus-within:border-accent/60", disabled && "opacity-40")}>
        <button type="button" disabled={disabled} onClick={() => step(-0.01)} className="grid h-10 w-9 place-items-center text-white/45 hover:text-white" aria-label={`Lower ${label}`}><Minus size={13} /></button>
        <input id={id} value={value} disabled={disabled} inputMode="decimal" autoComplete="off" onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} className="num w-full min-w-0 bg-transparent text-center text-[14px] text-white outline-none" />
        <button type="button" disabled={disabled} onClick={() => step(0.01)} className="grid h-10 w-9 place-items-center text-white/45 hover:text-white" aria-label={`Raise ${label}`}><Plus size={13} /></button>
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}

function SideCard({ kind, f, set, errors, mid, sym, priceSym, balance }: { kind: "ask" | "bid"; f: SideForm; set: (p: Partial<SideForm>) => void; errors: Record<string, string | undefined>; mid: number | null; sym: string; priceSym: string; balance?: string }) {
  const ask = kind === "ask";
  return (
    <section className={cx("panel relative overflow-hidden rounded-2xl p-4 transition", !f.on && "opacity-60")}>
      <span aria-hidden className={cx("absolute inset-x-0 top-0 h-px", ask ? "bg-gradient-to-r from-transparent via-ask/70 to-transparent" : "bg-gradient-to-r from-transparent via-bid/70 to-transparent")} />
      <header className="flex items-center justify-between">
        <div>
          <p className={cx("text-[13px] font-semibold", ask ? "text-ask" : "text-bid")}>{ask ? "Ask side" : "Bid side"}</p>
          <p className="text-[11px] text-white/45">{ask ? `Sell ${sym} above the price` : `Buy with ${sym} below the price`}</p>
        </div>
        <button role="switch" aria-checked={f.on} onClick={() => set({ on: !f.on })} className={cx("relative h-5 w-9 rounded-full transition", f.on ? (ask ? "bg-ask" : "bg-bid") : "bg-white/15")} aria-label={`${ask ? "Ask" : "Bid"} side enabled`}>
          <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", f.on ? "left-[18px]" : "left-0.5")} />
        </button>
      </header>
      <fieldset disabled={!f.on} className="mt-4 space-y-3">
        <div>
          <label htmlFor={`${kind}-amount`} className="flex justify-between text-[11px] text-white/50"><span>Inventory</span>{balance && <span>Wallet <span className="num text-white/70">{balance}</span></span>}</label>
          <div className={cx("mt-1.5 flex items-center gap-2 rounded-xl border bg-black/40 px-3 py-2.5", errors.amount && f.on ? "border-ask/60" : "border-white/[0.08] focus-within:border-accent/60")}>
            <input id={`${kind}-amount`} value={f.amount} inputMode="decimal" autoComplete="off" onChange={(e) => set({ amount: e.target.value.replace(/[^0-9.]/g, "") })} className="num w-full min-w-0 bg-transparent text-[18px] text-white outline-none" />
            <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[11.5px]">{sym}</span>
          </div>
          {errors.amount && f.on && <p className="mt-1 text-[11px] text-rose-300">{errors.amount}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <PriceInput id={`${kind}-start`} label={`Start (${priceSym})`} value={f.start} onChange={(v) => set({ start: v })} error={f.on ? errors.start : null} mid={mid} />
          <PriceInput id={`${kind}-end`} label={`End (${priceSym})`} value={f.limit ? f.start : f.end} onChange={(v) => set({ end: v })} error={f.on ? errors.end : null} disabled={f.limit} mid={mid} />
        </div>
      </fieldset>
    </section>
  );
}

export default function MakePage() {
  const m = MARKETS[0]!;
  const { accountId, connect, send, ready } = useWallet();
  const [ask, setAsk] = useState<SideForm>({ on: true, amount: "2", start: "5.04", end: "5.20", limit: false, alpha: 1 });
  const [bid, setBid] = useState<SideForm>({ on: true, amount: "10", start: "4.96", end: "4.80", limit: false, alpha: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seed = useSeed();
  const markets = usePolling(getMarkets, [], 8000, seed.markets);
  const row = markets.data?.find((r) => r.market_id === m.market_id);
  const mid = row?.best_ask && row?.best_bid ? (Number(row.best_ask) + Number(row.best_bid)) / 2 : row?.best_ask ? Number(row.best_ask) : row?.best_bid ? Number(row.best_bid) : null;

  const shape: Shape = ask.limit ? "limit" : (ask.alpha as Shape);
  const setShape = (s: Shape) => {
    const p = s === "limit" ? { limit: true } : { limit: false, alpha: s };
    setAsk((a) => ({ ...a, ...p }));
    setBid((b) => ({ ...b, ...p }));
  };
  const setRange = (w: number) => {
    const c = mid ?? 5;
    const f = (x: number) => x.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    setAsk((a) => ({ ...a, start: f(c * (1 + GAP)), end: f(c * (1 + GAP + w)) }));
    setBid((b) => ({ ...b, start: f(c * (1 - GAP)), end: f(c * (1 - GAP - w)) }));
  };

  const pa = useMemo(() => parseSide("ask", ask, m), [ask, m]);
  const pb = useMemo(() => parseSide("bid", bid, m), [bid, m]);
  const crossed = ask.on && bid.on && pa.side && pb.side && pb.side.start_price >= pa.side.start_price;
  const noSide = !ask.on && !bid.on;
  const valid = !noSide && (!ask.on || !!pa.side) && (!bid.on || !!pb.side) && !crossed;

  const prevA = useMemo(() => (ask.on && pa.side ? previewSide("ask", pa.side, m) : null), [ask.on, pa.side, m]);
  const prevB = useMemo(() => (bid.on && pb.side ? previewSide("bid", pb.side, m) : null), [bid.on, pb.side, m]);

  const need = { base: ask.on && pa.side ? pa.side.remaining : 0n, quote: bid.on && pb.side ? pb.side.remaining : 0n };
  const data = usePolling(async () => {
    if (!accountId) return null;
    const [ib, iq, wb, wq, reg] = await Promise.all([
      view<string>(BOOK, "get_balance", { account_id: accountId, token_id: m.base }),
      view<string>(BOOK, "get_balance", { account_id: accountId, token_id: m.quote }),
      ftBalance(m.base, accountId).catch(() => 0n),
      ftBalance(m.quote, accountId).catch(() => 0n),
      checkRegistration(accountId),
    ]);
    return { internal: { base: BigInt(ib), quote: BigInt(iq) }, wallet: { base: wb, quote: wq }, reg };
  }, [accountId], 5000);

  const d = data.data;
  const short = { base: d ? (need.base > d.internal.base ? need.base - d.internal.base : 0n) : need.base, quote: d ? (need.quote > d.internal.quote ? need.quote - d.internal.quote : 0n) : need.quote };
  const missingReg = d?.reg.filter((r) => !r.registered) ?? [];
  const lacksFunds = !!d && (short.base > d.wallet.base || short.quote > d.wallet.quote);
  const step1Needed = missingReg.length > 0 || short.base > 0n || short.quote > 0n;

  const run = async (txs: TxSpec[]) => {
    setBusy(true); setErr(null);
    try { await send(txs); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const deposit = () => {
    if (!accountId || !d) return;
    const txs: TxSpec[] = [...registrationTxs(accountId, d.reg)];
    if (short.base > 0n) txs.push(depositTx(m.base, BOOK, short.base));
    if (short.quote > 0n) txs.push(depositTx(m.quote, BOOK, short.quote));
    void run(txs);
  };
  const toArgs = (s: NonNullable<typeof pa.side>): SideArgs => ({ amount: s.remaining.toString(), start_price: s.start_price.toString(), end_price: s.end_price.toString(), alpha: s.alpha });
  const publish = () => void run([createPositionTx(BOOK, m.market_id, ask.on && pa.side ? toArgs(pa.side) : null, bid.on && pb.side ? toArgs(pb.side) : null)]);

  const quoteValue = (ask.on && prevA ? Number(ask.amount) * (mid ?? 0) : 0) + (bid.on ? Number(bid.amount) : 0);

  return (
    <>
      <PageHead title="Make a curve" sub="Pick a shape and a range, and your liquidity quotes both ways on its own. Whatever one side earns refills the other, with no bot."
        aside={<div className="panel flex items-center gap-4 rounded-xl px-4 py-2.5"><div><p className="label">Market</p><p className="text-[13px] font-medium">{m.baseSymbol} / {m.quoteSymbol}</p></div><div className="h-8 w-px bg-white/10" /><div><p className="label">Mid price</p><p className="num text-[15px] text-white">{mid ? mid.toFixed(4) : "—"}</p></div></div>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {/* Step 1: shape */}
          <Card title={<span><span className="mr-2 text-white/35">01</span>Liquidity shape</span>} aside={<span className="text-[11px] text-white/40">Applies to both sides</span>}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {SHAPES.map((s) => {
                const on = shape === s.v;
                return (
                  <button key={String(s.v)} onClick={() => setShape(s.v)} aria-pressed={on}
                    className={cx("group flex h-full flex-col items-stretch justify-start rounded-xl border p-3 text-left transition duration-300", on ? "border-white/25 bg-white/[0.05]" : "border-white/[0.07] bg-black/20 hover:-translate-y-0.5 hover:border-white/20")}>
                    <ShapeGlyph shape={s.v} on={on} />
                    <p className="mt-2.5 text-[13px] font-semibold">{s.name}</p>
                    <p className="text-[11px] leading-snug text-white/45">{s.desc}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 2: range + preview */}
          <Card pad={false} title={<span><span className="mr-2 text-white/35">02</span>Price range</span>}
            aside={<div className="flex items-center gap-2">
              {RANGES.map((r) => <button key={r.k} onClick={() => setRange(r.w)} className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-white/65 transition hover:border-white/25 hover:text-white">{r.label} ±{r.w * 100}%</button>)}
            </div>}>
            <div className="p-4 sm:p-5">
              <p className="mb-1 text-[11px] text-white/40">How much {m.baseSymbol} your curve trades at each price. Exact integer maths, same as the contract.</p>
              <div className="h-[300px]">
                {prevA || prevB ? (
                  <LiquidityChart minHeight={300} baseSymbol={m.baseSymbol} quoteSymbol={m.quoteSymbol} mid={mid}
                    bids={(prevB?.pts ?? []).map(([price, base]) => ({ price, base }))}
                    asks={(prevA?.pts ?? []).map(([price, base]) => ({ price, base }))}
                    bidCaption={bid.on ? `Your bid starts here · ${bid.amount || 0} ${m.quoteSymbol}` : undefined}
                    askCaption={ask.on ? `Your ask starts here · ${ask.amount || 0} ${m.baseSymbol}` : undefined} />
                ) : <div className="grid h-full place-items-center rounded-xl border border-dashed border-white/10 text-[12px] text-white/40">Fill in valid inputs to see your liquidity</div>}
              </div>
            </div>
          </Card>

          {crossed && <Notice tone="error" title="Sides overlap">The bid start price must be below the ask start price.</Notice>}
          {noSide && <Notice tone="warn">Turn on at least one side.</Notice>}

          {/* Step 3: sides */}
          <div className="grid gap-4 md:grid-cols-2">
            <SideCard kind="bid" f={bid} set={(p) => setBid({ ...bid, ...p })} errors={pb.errors} mid={mid} sym={m.quoteSymbol} priceSym={m.quoteSymbol} balance={d ? fmtUnits(d.wallet.quote, m.quote_decimals, 2) : undefined} />
            <SideCard kind="ask" f={ask} set={(p) => setAsk({ ...ask, ...p })} errors={pa.errors} mid={mid} sym={m.baseSymbol} priceSym={m.quoteSymbol} balance={d ? fmtUnits(d.wallet.base, m.base_decimals, 4) : undefined} />
          </div>

          {(prevA || prevB) && (
            <Card title="Fill ladder" aside={<span className="text-[11px] text-white/40">What takers pay as they eat into each side</span>}>
              <div className="grid gap-6 sm:grid-cols-2">
                {([["Bid", prevB, "text-bid"], ["Ask", prevA, "text-ask"]] as const).map(([l, p, c]) => p && (
                  <div key={l}>
                    <p className={cx("mb-1.5 text-[11.5px] font-medium", c)}>{l} side</p>
                    <table className="w-full text-[11.5px]">
                      <thead><tr className="text-left text-white/35"><th className="pb-1.5 font-normal">Filled</th><th className="pb-1.5 text-right font-normal">Marginal</th><th className="pb-1.5 text-right font-normal">Average</th></tr></thead>
                      <tbody>{p.slices.map((s) => (
                        <tr key={s.pct} className="border-t border-white/[0.05]">
                          <td className="py-1.5"><span className="flex items-center gap-2"><span className="h-1 w-10 overflow-hidden rounded-full bg-white/10"><span className={cx("block h-full", l === "Bid" ? "bg-bid" : "bg-ask")} style={{ width: `${s.pct}%` }} /></span><span className="num">{s.pct}%</span></span></td>
                          <td className="num py-1.5 text-right">{s.marginal}</td><td className="num py-1.5 text-right text-white/70">{s.avg}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Summary + publish */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card title="Your position">
            <dl className="space-y-2 text-[12px]">
              {[
                ["Shape", SHAPES.find((s) => s.v === shape)?.name ?? "—"],
                ["Bid side", bid.on ? `${bid.amount || 0} ${m.quoteSymbol}` : "Off"],
                ["Bid range", bid.on ? `${bid.start} → ${bid.limit ? bid.start : bid.end}` : "—"],
                ["Ask side", ask.on ? `${ask.amount || 0} ${m.baseSymbol}` : "Off"],
                ["Ask range", ask.on ? `${ask.start} → ${ask.limit ? ask.start : ask.end}` : "—"],
                ["Value at mid", mid ? `≈ ${quoteValue.toFixed(2)} ${m.quoteSymbol}` : "—"],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-white/45">{k}</dt><dd className="num text-right">{v}</dd></div>)}
            </dl>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-[11.5px] leading-relaxed text-white/70">
              <RefreshCw size={13} className="mt-0.5 shrink-0 text-accent" />
              <span>When a taker buys from your ask, the {m.quoteSymbol} you earn tops up your bid, and the other way round. No bot, no extra transaction.</span>
            </div>

            <div className="my-4 h-px bg-white/[0.06]" />
            {!accountId ? (
              <>
                <p className="text-[12.5px] text-white/55">Connect a wallet to deposit and publish.</p>
                <Btn className="mt-3 h-11 w-full" onClick={connect}>Connect wallet</Btn>
              </>
            ) : (
              <>
                <ol className="relative space-y-4 text-[13px]">
                  <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-white/10" />
                  <li className="relative flex gap-3">
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-4 ring-[#111113]", step1Needed ? "bg-white text-ink" : "bg-bid text-ink")}>{step1Needed ? "1" : <Check size={12} />}</span>
                    <div className="min-w-0">
                      <p className="font-medium">Deposit{missingReg.length ? " and register" : ""}</p>
                      <ul className="mt-1 space-y-0.5 text-[11.5px] text-white/55">
                        {missingReg.map((r) => <li key={r.contract}>Register on {r.label} ({fmtUnits(r.deposit, 24, 5)} NEAR)</li>)}
                        {short.base > 0n && <li className="num">Deposit {fmtUnits(short.base, m.base_decimals, 6)} {m.baseSymbol}</li>}
                        {short.quote > 0n && <li className="num">Deposit {fmtUnits(short.quote, m.quote_decimals, 4)} {m.quoteSymbol}</li>}
                        {!step1Needed && <li>Your book balance covers this.</li>}
                      </ul>
                    </div>
                  </li>
                  <li className="relative flex gap-3">
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-4 ring-[#111113]", step1Needed ? "bg-white/15 text-white/60" : "bg-white text-ink")}>2</span>
                    <div><p className="font-medium">Publish</p><p className="text-[11.5px] text-white/55">0.01 NEAR storage, refunded when you close.</p></div>
                  </li>
                </ol>
                {lacksFunds && <div className="mt-4"><Notice tone="warn" title="Not enough tokens in your wallet">{HAS_FAUCET ? <>Get wNEAR and tUSDC from the <Link href="/faucet" className="underline underline-offset-2">faucet</Link>.</> : <>Add {m.baseSymbol} and {m.quoteSymbol} to your wallet first.</>}</Notice></div>}
                {err && <p role="alert" className="mt-3 text-[12px] text-rose-300">{err}</p>}
                {step1Needed
                  ? <Btn className="mt-5 h-11 w-full" onClick={deposit} disabled={busy || !valid || !d || lacksFunds}>{busy ? "Waiting for wallet…" : "Deposit"}</Btn>
                  : <Btn className="mt-5 h-11 w-full" onClick={publish} disabled={busy || !valid}>{busy ? "Waiting for wallet…" : "Publish curve"}</Btn>}
                <p className="mt-3 text-[11px] leading-relaxed text-white/35">Deposits settle over a few blocks, so publishing is its own step.</p>
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
