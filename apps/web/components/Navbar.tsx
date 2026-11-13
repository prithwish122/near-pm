"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";

const links = [["Trade", "/trade"], ["Make", "/make"], ["How it works", "#products"], ["Docs", "#articles"]];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="relative z-20 border-b border-white/[0.06]">
      <div className="wrap flex h-[68px] items-center justify-between">
        <Logo />
        <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 text-[13px] text-white/85 md:flex">
          {links.map(([l, h]) => (
            <Link key={l} href={h} className="transition-colors hover:text-white">{l}</Link>
          ))}
        </nav>
        <div className="hidden items-center gap-6 md:flex">
          <Link href="/faucet" className="text-[13px] text-white/85 transition-colors hover:text-white">Faucet</Link>
          <Link href="/trade" className="rounded-lg border border-accent/80 px-5 py-2 text-[13px] text-white shadow-[0_0_0_1px_rgba(85,255,176,.15)] transition hover:bg-accent/20 hover:shadow-[0_0_24px_rgba(85,255,176,.45)]">Launch app</Link>
        </div>
        <button className="md:hidden" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="wrap flex flex-col gap-4 pb-6 text-sm md:hidden">
          {links.map(([l, h]) => <Link key={l} href={h} onClick={() => setOpen(false)}>{l}</Link>)}
          <div className="flex gap-4 pt-2">
            <Link href="/faucet" onClick={() => setOpen(false)}>Faucet</Link>
            <Link href="/trade" className="rounded-lg border border-accent/80 px-4 py-1.5">Launch app</Link>
          </div>
        </div>
      )}
    </header>
  );
}
