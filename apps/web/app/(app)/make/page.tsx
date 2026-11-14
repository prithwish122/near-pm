"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import DepthPlot, { type Series } from "@/components/app/DepthPlot";
import { Btn, Card, Field, Notice, PageHead, cx } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { BOOK, HAS_FAUCET, MARKETS } from "@/lib/config";
import { parseSide, previewSide, type SideForm } from "@/lib/curvePreview";
import { fmtUnits, parseAmount } from "@/lib/format";
import { checkRegistration, registrationTxs } from "@/lib/registration";
import { ftBalance, view } from "@/lib/rpc";
import { createPositionTx, depositTx, type SideArgs, type TxSpec } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";

const ALPHA_HELP = ["Even spread across the range", "Slightly bunched near the current price", "More bunched near the current price", "Tightly bunched near the current price"];

function SideForm({ kind, f, set, errors, unit, amountSym, priceSym }: { kind: "ask" | "bid"; f: SideForm; set: (p: Partial<SideForm>) => void; errors: Record<string, string | undefined>; unit: string; amountSym: string; priceSym: string }) {
  const ask = kind === "ask";
  return (
    <Card title={<span className={ask ? "text-mint" : "text-sky-300"}>{ask ? `Ask: sell ${amountSym}` : `Bid: buy ${unit}`}</span>}
      aside={<label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/70"><input type="checkbox" checked={f.on} onChange={(e) => set({ on: e.target.checked })} className="h-4 w-4 accent-[#55ffb0]" />Enabled</label>}>
      <div className={cx("space-y-4", !f.on && "pointer-events-none opacity-40")} aria-disabled={!f.on}>
        <Field label={ask ? "Inventory" : "Inventory"} value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^0-9.]/g, "") })} suffix={amountSym} error={f.on ? errors.amount : null} id={`${kind}-amount`} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start price" value={f.start} onChange={(e) => set({ start: e.target.value.replace(/[^0-9.]/g, "") })} suffix={priceSym} error={f.on ? errors.start : null} id={`${kind}-start`} />
          <Field label="End price" value={f.limit ? f.start : f.end} disabled={f.limit} onChange={(e) => set({ end: e.target.value.replace(/[^0-9.]/g, "") })} suffix={priceSym} error={f.on ? errors.end : null} id={`${kind}-end`} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/75"><input type="checkbox" checked={f.limit} onChange={(e) => set({ limit: e.target.checked })} className="h-4 w-4 accent-[#55ffb0]" />Limit order (single price)</label>
        <div className={cx(f.limit && "opacity-40")}>
          <label htmlFor={`${kind}-alpha`} className="flex items-center justify-between text-[11px] text-white/70"><span>Shape (alpha)</span><span className="tabular-nums text-white">{f.alpha}</span></label>
          <input id={`${kind}-alpha`} type="range" min={0} max={3} step={1} value={f.alpha} disabled={f.limit} onChange={(e) => set({ alpha: Number(e.target.value) })} className="mt-2 w-full accent-[#55ffb0]" />
          <div className="flex justify-between text-[10px] text-white/40"><span>0</span><span>1</span><span>2</span><span>3</span></div>
          <p className="mt-1 text-[11px] text-white/45">{f.limit ? "Not used for a limit order." : ALPHA_HELP[f.alpha]}</p>
        </div>
      </div>
    </Card>
  );
}

export default function MakePage() {
  const m = MARKETS[0]!;
  const { accountId, connect, send, ready } = useWallet();
  const [ask, setAsk] = useState<SideForm>({ on: true, amount: "2", start: "5.04", end: "5.20", limit: false, alpha: 1 });
  const [bid, setBid] = useState<SideForm>({ on: true, amount: "10", start: "4.96", end: "4.80", limit: false, alpha: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pa = useMemo(() => parseSide("ask", ask, m), [ask, m]);
  const pb = useMemo(() => parseSide("bid", bid, m), [bid, m]);

  // Contract rule E15: bid start < ask start.
  const crossed = ask.on && bid.on && pa.side && pb.side && pb.side.start_price >= pa.side.start_price;
  const noSide = !ask.on && !bid.on;
  const askOk = !ask.on || !!pa.side;
  const bidOk = !bid.on || !!pb.side;
  const valid = !noSide && askOk && bidOk && !crossed;

  const prevA = useMemo(() => (ask.on && pa.side ? previewSide("ask", pa.side, m) : null), [ask.on, pa.side, m]);
  const prevB = useMemo(() => (bid.on && pb.side ? previewSide("bid", pb.side, m) : null), [bid.on, pb.side, m]);
  const series: Series[] = [
    ...(prevA ? [{ key: "ask", label: `Ask (${m.baseSymbol})`, color: "#55ffb0", area: true, pts: prevA.pts }] : []),
    ...(prevB ? [{ key: "bid", label: `Bid (${m.baseSymbol} buyable)`, color: "#5cc8ff", area: true, pts: [...prevB.pts].sort((a, b) => a[0] - b[0]) }] : []),
  ];

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

  const slice = (p: typeof prevA, label: string, color: string) => p && (
    <div>
      <p className={cx("mb-1.5 text-[11px] font-medium", color)}>{label}</p>
      <table className="w-full text-[11px] tabular-nums">
        <thead><tr className="text-left text-white/40"><th className="pb-1 font-normal">Filled</th><th className="pb-1 text-right font-normal">Marginal price</th><th className="pb-1 text-right font-normal">Avg price</th></tr></thead>
        <tbody>{p.slices.map((s) => <tr key={s.pct} className="border-t border-white/5"><td className="py-1">{s.pct}%</td><td className="py-1 text-right">{s.marginal}</td><td className="py-1 text-right">{s.avg}</td></tr>)}</tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHead title="Make" sub="Publish a curve once and let it quote both ways. What you earn on one side refills the other, with no bot. Limit orders are curves that collapsed to a point." />
      <div className="grid gap-5 lg:grid-cols-2">
        <SideForm kind="ask" f={ask} set={(p) => setAsk({ ...ask, ...p })} errors={pa.errors} unit={m.baseSymbol} amountSym={m.baseSymbol} priceSym={m.quoteSymbol} />
        <SideForm kind="bid" f={bid} set={(p) => setBid({ ...bid, ...p })} errors={pb.errors} unit={m.baseSymbol} amountSym={m.quoteSymbol} priceSym={m.quoteSymbol} />
      </div>

      {crossed && <div className="mt-5"><Notice tone="error" title="Crossed position (E15)">The bid start price must be below the ask start price.</Notice></div>}
      {noSide && <div className="mt-5"><Notice tone="warn">Enable at least one side.</Notice></div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Curve preview" aside={<span className="text-[11px] text-white/45">Exact integer maths, same as the contract</span>}>
          <DepthPlot series={series} xLabel={`Price (${m.quoteSymbol} per ${m.baseSymbol})`} yLabel={`Cumulative ${m.baseSymbol}`} empty="Fill in valid inputs to see the curve" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {slice(prevA, "Ask slices", "text-mint")}
            {slice(prevB, "Bid slices", "text-sky-300")}
          </div>
        </Card>

        <Card title="Publish">
          {!accountId ? (
            <>
              <p className="text-[13px] text-white/60">Connect a wallet to deposit and publish.</p>
              <Btn className="mt-4 w-full" onClick={connect} disabled={!ready}>Connect wallet</Btn>
            </>
          ) : (
            <>
              <ol className="space-y-4 text-[13px]">
                <li className="flex gap-3">
                  <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]", step1Needed ? "bg-white text-dark" : "bg-emerald-400 text-dark")}>{step1Needed ? "1" : <Check size={12} />}</span>
                  <div className="min-w-0">
                    <p className="font-medium">Deposit{missingReg.length ? " and register" : ""}</p>
                    <ul className="mt-1 space-y-0.5 text-[12px] text-white/60 tabular-nums">
                      {missingReg.map((r) => <li key={r.contract}>Register on {r.label} ({fmtUnits(r.deposit, 24, 5)} NEAR)</li>)}
                      {short.base > 0n && <li>Deposit {fmtUnits(short.base, m.base_decimals, 6)} {m.baseSymbol}</li>}
                      {short.quote > 0n && <li>Deposit {fmtUnits(short.quote, m.quote_decimals, 4)} {m.quoteSymbol}</li>}
                      {!step1Needed && <li>Book balance covers this position.</li>}
                    </ul>
                    {d && <p className="mt-1 text-[11px] text-white/40">Book balance: {fmtUnits(d.internal.base, m.base_decimals, 4)} {m.baseSymbol} · {fmtUnits(d.internal.quote, m.quote_decimals, 2)} {m.quoteSymbol}</p>}
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]", step1Needed ? "bg-white/15 text-white/60" : "bg-white text-dark")}>2</span>
                  <div><p className="font-medium">Publish position</p><p className="text-[12px] text-white/60">Storage deposit 0.01 NEAR, refunded when you close.</p></div>
                </li>
              </ol>
              {lacksFunds && <div className="mt-4"><Notice tone="warn" title="Not enough tokens in your wallet">{HAS_FAUCET ? <>Get wNEAR and tUSDC from the <Link href="/faucet" className="underline underline-offset-2">faucet</Link>.</> : <>Add {m.baseSymbol} and {m.quoteSymbol} to your wallet first.</>}</Notice></div>}
              {err && <p role="alert" className="mt-3 text-[12px] text-rose-300">{err}</p>}
              {step1Needed ? (
                <Btn className="mt-5 w-full" onClick={deposit} disabled={busy || !valid || !d || lacksFunds}>{busy ? "Waiting for wallet…" : "Step 1: Deposit"}</Btn>
              ) : (
                <Btn className="mt-5 w-full" onClick={publish} disabled={busy || !valid}>{busy ? "Waiting for wallet…" : "Step 2: Publish position"}</Btn>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-white/40">Deposits settle over a few blocks, so publishing is a separate step. This avoids publishing before your balance is credited.</p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
