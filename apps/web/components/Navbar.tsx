"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import Logo from "./Logo";
import { HAS_FAUCET, IS_MAINNET, NETWORK } from "@/lib/config";
import { cx } from "./app/ui";

const links = [["Trade", "/trade"], ["Make", "/make"], ["How it works", "/#how"], ["Docs", "/#docs"]];

/**
 * Landing navbar: same box and spacing as the app header. Transparent over the hero so it blends in,
 * then it fades into the app header's blurred bar once the page scrolls.
 */
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const solid = scrolled || open;
  return (
    <header className={cx("fixed inset-x-0 top-0 z-30 border-b transition-[background-color,border-color,backdrop-filter] duration-500", solid ? "border-white/[0.06] bg-[#0a0f0c]/85 backdrop-blur-xl" : "border-transparent bg-transparent")}>
      <div className="relative mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5"><Logo /><span className={cx("pill capitalize", IS_MAINNET ? "border-rose-300/40 bg-rose-300/10 text-rose-200" : "border-amber-300/30 bg-amber-300/[0.07] text-amber-200/90")}>{NETWORK}</span></div>
          <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {links.map(([l, h]) => (
              <Link key={l} href={h} className="rounded-full px-3.5 py-1.5 text-[13px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white">{l}</Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {HAS_FAUCET && <Link href="/faucet" className="inline-flex h-9 items-center rounded-full bg-white/[0.07] px-4 text-[13px] text-white/80 transition-colors hover:bg-white/[0.12] hover:text-white">Faucet</Link>}
          <Link href="/trade" className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-semibold text-ink transition hover:bg-mint">Launch app<ArrowRight size={14} /></Link>
        </div>
        <button className="-mr-2 grid h-11 w-11 place-items-center rounded-full md:hidden" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 pb-5 text-[14px] sm:px-6 md:hidden">
          {[...links, ...(HAS_FAUCET ? [["Faucet", "/faucet"]] : [])].map(([l, h]) => <Link key={l} href={h} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-lg px-1 text-white/80 hover:text-white">{l}</Link>)}
          <Link href="/trade" onClick={() => setOpen(false)} className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald text-[14px] font-medium text-black">Launch app<ArrowRight size={14} /></Link>
        </div>
      )}
    </header>
  );
}
