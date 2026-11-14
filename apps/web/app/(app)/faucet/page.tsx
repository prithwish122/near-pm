"use client";
import { useState } from "react";
import { Btn, Card, Field, Notice, PageHead, Skeleton } from "@/components/app/ui";
import { useWallet } from "@/components/app/WalletProvider";
import { BOOK, HAS_FAUCET, MARKETS } from "@/lib/config";
import { fmtNear, fmtUnits, parseAmount, YOCTO } from "@/lib/format";
import { checkRegistration, registrationTxs } from "@/lib/registration";
import { ftBalance, nearBalance, view } from "@/lib/rpc";
import { mintTx, storageDepositTx, unwrapNearTx, wrapNearTx, type TxSpec } from "@/lib/tx";
import { usePolling } from "@/lib/usePolling";

const MINT_LIMIT = 10_000n;

export default function FaucetPage() {
  const m = MARKETS[0]!;
  const { accountId, connect, send, ready } = useWallet();
  const [mint, setMint] = useState("1000");
  const [wrap, setWrap] = useState("1");
  const [unwrap, setUnwrap] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, loading } = usePolling(async () => {
    if (!accountId) return null;
    const [near, wnear, usdc, reg, wrapReg] = await Promise.all([
      nearBalance(accountId),
      ftBalance(m.base, accountId).catch(() => 0n),
      ftBalance(m.quote, accountId).catch(() => 0n),
      checkRegistration(accountId),
      view<unknown>(m.base, "storage_balance_of", { account_id: accountId }),
    ]);
    return { near, wnear, usdc, reg, wrapRegistered: wrapReg !== null };
  }, [accountId], 6000);

  const run = async (key: string, txs: TxSpec[]) => {
    setBusy(key); setErr(null);
    try { await send(txs); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const mintAmt = parseAmount(mint, m.quote_decimals);
  const mintBad = mintAmt === null || mintAmt === 0n || mintAmt > MINT_LIMIT * 10n ** BigInt(m.quote_decimals);
  const wrapAmt = parseAmount(wrap, 24);
  const wrapBad = wrapAmt === null || wrapAmt === 0n || (!!data && wrapAmt + YOCTO / 5n > data.near);
  const unwrapAmt = parseAmount(unwrap, 24);
  const unwrapBad = unwrapAmt === null || unwrapAmt === 0n || (!!data && unwrapAmt > data.wnear);
  const missing = data?.reg.filter((r) => !r.registered) ?? [];

  const doWrap = () => {
    if (!accountId || !wrapAmt || !data) return;
    const txs: TxSpec[] = [];
    if (!data.wrapRegistered) txs.push(storageDepositTx(m.base, accountId, 1_250_000_000_000_000_000_000n));
    txs.push(wrapNearTx(m.base, wrapAmt));
    void run("wrap", txs);
  };

  if (!HAS_FAUCET)
    return (<><PageHead title="Faucet" sub="Test tokens are available on testnet only." /><Notice tone="info" title="Not available on mainnet">There is no faucet on mainnet. Use real wNEAR and USDC, and keep amounts small.</Notice></>);

  if (!accountId)
    return (<><PageHead title="Faucet" sub="Get test tokens and register your account." /><Card><p className="text-[13px] text-white/60">Connect a wallet to use the faucet. You can get testnet NEAR from the NEAR testnet faucet.</p><Btn className="mt-4" onClick={connect}>Connect wallet</Btn></Card></>);

  return (
    <>
      <PageHead title="Faucet" sub="Everything you need to trade or make on testnet: tUSDC, wNEAR and one-click registration." />
      {err && <div className="mb-5"><Notice tone="error" title="Something went wrong">{err}</Notice></div>}

      <Card title="Your balances" className="mb-5">
        {loading && !data ? <Skeleton className="h-16" /> : data && (
          <dl className="grid gap-4 text-[13px] tabular-nums sm:grid-cols-3">
            <div><dt className="text-[11px] uppercase tracking-wider text-white/45">NEAR</dt><dd className="mt-1 text-[18px]">{fmtNear(data.near)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-white/45">{m.baseSymbol}</dt><dd className="mt-1 text-[18px]">{fmtUnits(data.wnear, m.base_decimals, 4)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-white/45">{m.quoteSymbol}</dt><dd className="mt-1 text-[18px]">{fmtUnits(data.usdc, m.quote_decimals, 2)}</dd></div>
          </dl>
        )}
      </Card>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={`Mint ${m.quoteSymbol}`}>
          <p className="mb-4 text-[12px] leading-relaxed text-white/55">Free test USDC. Up to {MINT_LIMIT.toString()} per call; your account is registered automatically.</p>
          <Field label="Amount" value={mint} onChange={(e) => setMint(e.target.value.replace(/[^0-9.]/g, ""))} suffix={m.quoteSymbol} error={mint && mintBad ? `Enter 1 to ${MINT_LIMIT} ${m.quoteSymbol}` : null} />
          <Btn className="mt-4 w-full" disabled={mintBad || busy !== null} onClick={() => mintAmt && run("mint", [mintTx(m.quote, mintAmt)])}>{busy === "mint" ? "Waiting for wallet…" : `Mint ${m.quoteSymbol}`}</Btn>
        </Card>

        <Card title={`Wrap NEAR → ${m.baseSymbol}`}>
          <p className="mb-4 text-[12px] leading-relaxed text-white/55">Swap native NEAR for wrapped NEAR (near_deposit on {m.base}). Keep some NEAR for gas.</p>
          <Field label="Amount" value={wrap} onChange={(e) => setWrap(e.target.value.replace(/[^0-9.]/g, ""))} suffix="NEAR" error={wrap && wrapBad && data ? "Invalid, or leaves too little NEAR for gas" : null} />
          <Btn className="mt-4 w-full" disabled={wrapBad || busy !== null || !data} onClick={doWrap}>{busy === "wrap" ? "Waiting for wallet…" : `Wrap to ${m.baseSymbol}`}</Btn>
        </Card>

        <Card title={`Unwrap ${m.baseSymbol} → NEAR`}>
          <p className="mb-4 text-[12px] leading-relaxed text-white/55">Turn wrapped NEAR back into native NEAR (near_withdraw on {m.base}).</p>
          <Field label="Amount" value={unwrap} onChange={(e) => setUnwrap(e.target.value.replace(/[^0-9.]/g, ""))} suffix={m.baseSymbol} error={unwrap && unwrapBad && data ? `Enter up to ${fmtUnits(data.wnear, m.base_decimals, 4)} ${m.baseSymbol}` : null} />
          <Btn className="mt-4 w-full" disabled={unwrapBad || busy !== null || !data} onClick={() => unwrapAmt && run("unwrap", [unwrapNearTx(m.base, unwrapAmt)])}>{busy === "unwrap" ? "Waiting for wallet…" : "Unwrap to NEAR"}</Btn>
        </Card>

        <Card title="Register">
          <p className="mb-3 text-[12px] leading-relaxed text-white/55">Storage registration (NEP-145) is needed on the book and both tokens.</p>
          <ul className="space-y-1.5 text-[12px]">
            {data?.reg.map((r) => <li key={r.contract} className="flex justify-between"><span className="text-white/70">{r.label}</span><span className={r.registered ? "text-emerald-300" : "text-amber-200"}>{r.registered ? "Registered" : `${fmtUnits(r.deposit, 24, 5)} NEAR`}</span></li>)}
          </ul>
          <Btn className="mt-4 w-full" disabled={!missing.length || busy !== null || !data} onClick={() => data && run("reg", registrationTxs(accountId, data.reg))}>{busy === "reg" ? "Waiting for wallet…" : missing.length ? `Register (${missing.length})` : "All registered"}</Btn>
        </Card>
      </div>
      <p className="mt-5 text-[11px] text-white/40">Book contract: {BOOK}. Need testnet NEAR? Use the official NEAR testnet faucet.</p>
    </>
  );
}
