"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Wallet } from "lucide-react";
import Logo from "@/components/Logo";
import { BOOK, NETWORK, accountUrl } from "@/lib/config";
import { shortAccount } from "@/lib/format";
import { cx } from "./ui";
import TxBanner from "./TxBanner";
import { useWallet } from "./WalletProvider";

const NAV = [["Trade", "/trade"], ["Make", "/make"], ["Portfolio", "/portfolio"], ["Activity", "/activity"], ["Faucet", "/faucet"], ["Fund", "/fund"]] as const;

function WalletButton() {
  const { ready, accountId, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!accountId)
    return <button onClick={connect} disabled={!ready} className="inline-flex h-9 items-center gap-2 rounded-lg border border-accent/80 px-4 text-[13px] transition hover:bg-accent/20 disabled:opacity-50"><Wallet size={14} />{ready ? "Connect wallet" : "Loading…"}</button>;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-[13px] hover:bg-white/10"><span className="h-2 w-2 rounded-full bg-emerald-400" />{shortAccount(accountId, 20)}</button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-white/10 bg-[#0b1f15]/95 p-1 shadow-2xl backdrop-blur">
          <button onClick={() => { setOpen(false); void disconnect(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] hover:bg-white/10"><LogOut size={13} />Disconnect</button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-ink/85 backdrop-blur-xl">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3"><Logo /><span className="pill border-amber-300/40 bg-amber-300/10 capitalize text-amber-200">{NETWORK}</span></div>
          <nav aria-label="App" className="hidden items-center gap-1 md:flex">
            {NAV.map(([l, h]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} className={cx("rounded-lg px-3.5 py-1.5 text-[13px] transition", path === h ? "bg-white/10 text-white" : "text-white/65 hover:text-white")}>{l}</Link>)}
          </nav>
          <WalletButton />
        </div>
        <nav aria-label="App (mobile)" className="wrap flex gap-1 overflow-x-auto pb-2 md:hidden">
          {NAV.map(([l, h]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} className={cx("shrink-0 rounded-lg px-3 py-1.5 text-[13px]", path === h ? "bg-white/10 text-white" : "text-white/65")}>{l}</Link>)}
        </nav>
      </header>
      <main className="wrap flex-1 py-8 sm:py-10">
        <TxBanner />
        {children}
      </main>
      <footer className="border-t border-white/[0.07] py-6 text-[11px] text-white/45">
        <div className="wrap flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>Ebbflow on NEAR {NETWORK}. Testnet only, not audited.</p>
          <p>Book contract: <a className="underline underline-offset-2 hover:text-white" href={accountUrl(BOOK)} target="_blank" rel="noreferrer">{BOOK}</a></p>
        </div>
      </footer>
    </div>
  );
}
