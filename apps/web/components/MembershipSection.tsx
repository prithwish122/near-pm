import Link from "next/link";
import { ShieldCheck, Undo2 } from "lucide-react";
import Reveal from "./Reveal";
import WorldMap from "./WorldMap";

export function SafetyCard() {
  return (
    <div className="glass relative h-full overflow-hidden rounded-[22px] p-6 sm:p-7">
      <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-72 rounded-full bg-[#2fd68a]/25 blur-3xl" aria-hidden />
      <h3 className="text-[22px] font-normal leading-tight text-white/95 sm:text-[26px]">Safe by construction,<br />not by trust</h3>
      <p className="mt-3 max-w-[340px] text-[11px] leading-relaxed text-white/55">
        No owner method can touch balances or positions, and pausing never blocks close or withdraw. Curves are immutable, arithmetic is checked U256, and every rounding step favours the maker.
      </p>
      <div className="relative mt-6 space-y-2 sm:ml-auto sm:max-w-[340px]">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/25 text-mint"><ShieldCheck size={18} /></span>
          <div className="text-[11px]"><p className="text-white/90">Limit enforced on-chain</p><p className="text-white/50">A bad quote can only cause a refund</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-300/20 text-amber-200"><Undo2 size={18} /></span>
          <div className="text-[11px]"><p className="text-white/90">Route no longer valid</p><p className="text-white/50">Refunded in full, state unchanged</p></div>
        </div>
      </div>
    </div>
  );
}

export function IntentsCard() {
  return (
    <div className="glass relative h-full min-h-[240px] overflow-hidden rounded-[22px] p-6 sm:p-7">
      <div className="pointer-events-none absolute bottom-0 right-0 top-[48%] w-full opacity-90 sm:top-0 sm:w-[54%] [mask-image:linear-gradient(180deg,transparent_5%,#000_40%)]"><WorldMap /></div>
      <h3 className="relative text-[22px] font-normal text-white/95 sm:text-[26px]">Open to every chain</h3>
      <p className="relative mt-3 max-w-[310px] text-[11px] leading-relaxed text-white/55">
        The same curves are designed to answer NEAR Intents swap requests, so users on other chains can fill against Ebbflow liquidity. Stretch goal: on mainnet with tiny amounts.
      </p>
    </div>
  );
}

export default function MembershipSection() {
  return (
    <section id="community" className="wrap py-10 sm:py-16">
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.6fr] lg:gap-5">
        <Reveal>
          <div className="member-glow relative flex h-full min-h-[420px] flex-col items-center overflow-hidden rounded-[22px] border border-white/10 px-6 pt-12 text-center lg:min-h-[500px]">
            <h3 className="text-[26px] font-normal leading-[1.2] text-white sm:text-[30px]">Publish a curve.<br />Earn the spread<br />without a bot</h3>
            <p className="mt-4 max-w-[240px] text-[11px] leading-relaxed text-white/60">Set your range and shape once. Withdraw or close any time, and only you can move your funds.</p>
            <Link href="/make" className="mt-6 rounded-lg border border-white/25 bg-black/50 px-6 py-2 text-xs text-white transition hover:border-white/60 hover:bg-black/70">Start making</Link>
          </div>
        </Reveal>
        <div className="grid gap-4 lg:grid-rows-2 lg:gap-5">
          <Reveal delay={0.08}><SafetyCard /></Reveal>
          <Reveal delay={0.14}><IntentsCard /></Reveal>
        </div>
      </div>
    </section>
  );
}
