"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, LogOut, Wallet } from "lucide-react";
import Logo from "@/components/Logo";
import { BOOK, HAS_FAUCET, IS_MAINNET, NETWORK, NETWORK_NOTE, accountUrl } from "@/lib/config";
import { shortAccount } from "@/lib/format";
import { cx } from "./ui";
import TxBanner from "./TxBanner";
import { useWallet } from "./WalletProvider";

const NAV = [["Trade", "/trade"], ["Make", "/make"], ["Portfolio", "/portfolio"], ["Activity", "/activity"], ...(HAS_FAUCET ? [["Faucet", "/faucet"]] : []), ["Fund", "/fund"]] as [string, string][];

function WalletButton() {
  const { ready, accountId, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  if (!accountId)
    return <button onClick={connect} className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-semibold text-ink transition hover:bg-mint disabled:opacity-50"><Wallet size={14} />Connect</button>;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pl-1.5 pr-3 text-[13px] transition hover:bg-white/[0.08]">
        <span className="h-6 w-6 rounded-full bg-gradient-to-br from-accent via-[#4aa3ff] to-[#c19bff]" />{shortAccount(accountId, 20)}
      </button>
      {open && (
        <div className="rise absolute right-0 top-11 z-30 w-64 rounded-2xl border border-white/10 bg-[#18181b]/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2.5 p-2">
            <span className="h-9 w-9 rounded-full bg-gradient-to-br from-accent via-[#4aa3ff] to-[#c19bff]" />
            <div className="min-w-0"><p className="truncate text-[13px] font-medium">{accountId}</p><p className="text-[11px] text-white/45">NEAR {NETWORK}</p></div>
          </div>
          <div className="my-1 h-px bg-white/[0.06]" />
          <button onClick={() => { void navigator.clipboard.writeText(accountId); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-white/80 hover:bg-white/[0.06]"><Copy size={13} />{copied ? "Copied" : "Copy address"}</button>
          <a href={accountUrl(accountId)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white/80 hover:bg-white/[0.06]"><ExternalLink size={13} />View on explorer</a>
          <Link href="/portfolio" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white/80 hover:bg-white/[0.06]"><Wallet size={13} />Portfolio</Link>
          <button onClick={() => { setOpen(false); void disconnect(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-rose-300 hover:bg-ask/10"><LogOut size={13} />Disconnect</button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const wide = path === "/trade";
  return (
    <div className="app-bg flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0f0c]/85 backdrop-blur-xl">
        <div className="relative mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5"><Logo /><span className={cx("pill capitalize", IS_MAINNET ? "border-rose-300/40 bg-rose-300/10 text-rose-200" : "border-amber-300/30 bg-amber-300/[0.07] text-amber-200/90")}>{NETWORK}</span></div>
            <nav aria-label="App" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
              {NAV.map(([l, h]) => (
                <Link key={h} href={h} aria-current={path === h ? "page" : undefined} className={cx("relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors", path === h ? "text-white" : "text-white/60 hover:text-white")}>
                  {path === h && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white/[0.08]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  <span className="relative">{l}</span>
                </Link>
              ))}
            </nav>
          </div>
          <WalletButton />
        </div>
        <nav aria-label="App (mobile)" className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {NAV.map(([l, h]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} className={cx("shrink-0 rounded-full px-3.5 py-2 text-[13px]", path === h ? "bg-white/10 text-white" : "text-white/60")}>{l}</Link>)}
        </nav>
      </header>
      <main className={cx("mx-auto w-full flex-1", wide ? "max-w-[1680px] px-3 py-3 sm:px-4" : "max-w-wrap px-5 py-8 sm:px-8 sm:py-10")}>
        <TxBanner />
        <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
      </main>
      <footer className="border-t border-white/[0.06] py-4 text-[11px] text-white/40">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Ebbflow on NEAR {NETWORK}. {NETWORK_NOTE[0]!.toUpperCase() + NETWORK_NOTE.slice(1)}.</p>
          <p>Book contract <a className="num text-white/60 underline-offset-2 hover:text-white hover:underline" href={accountUrl(BOOK)} target="_blank" rel="noreferrer">{BOOK}</a></p>
        </div>
      </footer>
    </div>
  );
}
