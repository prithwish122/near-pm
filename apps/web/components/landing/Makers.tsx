"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import Reveal from "../Reveal";
import { MARKET } from "@/lib/config";
import { Tag } from "./ui";
import { shortName, useLive } from "./live";

const SHAPES = [["Flat", 1], ["Gentle", 2], ["Steep", 3], ["Sharp", 4]] as const;

const GUARANTEES = [
  ["0 owner methods", "No owner method can touch balances or positions. Only you can move your funds."],
  ["Always exit", "Pausing never blocks close or withdraw. You can always get out."],
  ["U256, checked", "Curves are immutable and every rounding step favours the maker."],
  ["Limit on-chain", "The taker's limit is enforced by the contract. A bad quote can only refund."],
] as const;

/**
 * A small curve builder: pick a shape and how much a taker buys, and see the price move along the
 * curve. It uses Ebbflow's own pricing (p(x) = start + (end - start)·x^k, average = start + (end - start)·x^k/(k+1)),
 * starting from a real maker's live range.
 */
function CurveBuilder() {
  const { curves } = useLive();
  const live = curves?.positions.find((p) => p.side === "ask" && p.points.length > 2 && p.points[0]!.price !== p.points[p.points.length - 1]!.price);
  const prices = live ? live.points.map((p) => p.price) : [5.04, 5.2];
  const start = Math.min(...prices), end = Math.max(...prices);
  const [k, setK] = useState(3);
  const [take, setTake] = useState(40);
  // start from the live maker's own shape once the book loads
  const liveId = live?.position_id, liveAlpha = live?.alpha;
  useEffect(() => { if (liveAlpha != null) setK(Math.min(4, Math.max(1, liveAlpha + 1))); }, [liveId, liveAlpha]);

  const x = take / 100;
  const marginal = start + (end - start) * Math.pow(x, k);
  const average = start + ((end - start) * Math.pow(x, k)) / (k + 1);
  const W = 560, H = 170, P = 8;
  const px = (u: number) => P + u * (W - 2 * P);
  const py = (v: number) => H - P - v * (H - 2 * P);
  const path = Array.from({ length: 61 }, (_, i) => { const u = i / 60; return `${i ? "L" : "M"}${px(u).toFixed(1)},${py(Math.pow(u, k)).toFixed(1)}`; }).join(" ");
  const filled = Array.from({ length: 41 }, (_, i) => { const u = (i / 40) * x; return `${i ? "L" : "M"}${px(u).toFixed(1)},${py(Math.pow(u, k)).toFixed(1)}`; }).join(" ");

  return (
    <div className="flex h-full flex-col rounded-[20px] border border-white/10 bg-[#030604] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-white/60">
          {live ? `${shortName(live.owner_id)}'s range · live` : "Example range"}
        </p>
        <div role="radiogroup" aria-label="Curve shape" className="flex rounded-full border border-white/10 bg-white/[0.04] p-1">
          {SHAPES.map(([label, kk]) => (
            <button key={label} type="button" role="radio" aria-checked={k === kk} onClick={() => setK(kk)}
              className={`min-h-9 rounded-full px-3 text-[12.5px] transition-colors ${k === kk ? "bg-accent font-semibold text-ink" : "text-white/70 hover:text-white"}`}>{label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-40 w-full" aria-hidden>
        <defs><linearGradient id="cb-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35dc90" stopOpacity=".35" /><stop offset="1" stopColor="#35dc90" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <path key={g} d={`M${px(0)},${py(g)} H${px(1)}`} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />)}
        <path d={`${filled} L${px(x)},${py(0)} L${px(0)},${py(0)} Z`} fill="url(#cb-fill)" />
        <path d={path} fill="none" stroke="rgba(162,255,208,.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path d={filled} fill="none" stroke="#35dc90" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        <path d={`M${px(x)},${py(0)} V${py(Math.pow(x, k))}`} stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <circle cx={px(x)} cy={py(Math.pow(x, k))} r="5" fill="#e2fff0" vectorEffect="non-scaling-stroke" />
        <path d={`M${px(0)},${py(0)} H${px(1)}`} stroke="rgba(255,255,255,.2)" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-white/60"><span>{start.toFixed(3)}</span><span>{end.toFixed(3)} {MARKET.quoteSymbol}</span></div>

      <label className="mb-5 mt-5 block">
        <span className="flex justify-between text-[13px] text-white/75"><span>A taker buys</span><span className="font-mono text-white">{take}% of the curve</span></span>
        <input type="range" min={1} max={100} value={take} onChange={(e) => setTake(Number(e.target.value))} aria-label="How much of the curve a taker buys"
          className="mt-2 h-6 w-full cursor-pointer accent-[#35dc90]" />
      </label>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-white/15 pt-4">
        <div className="flex gap-8">
          <div><p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-white/60">Last price</p><p className="mt-1 font-mono text-[18px] text-white">{marginal.toFixed(4)}</p></div>
          <div><p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-white/60">Average paid</p><p className="mt-1 font-mono text-[18px] text-mint">{average.toFixed(4)}</p></div>
        </div>
        <Link href="/make" className="group inline-flex h-11 items-center gap-2 rounded-full bg-accent pl-5 pr-4 text-[14px] font-semibold text-ink transition-colors hover:bg-mint">
          Publish yours<ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/** Makers on the left with a curve builder, the safety guarantees on the right as four tiles. Both columns
 *  share one structure (label, heading, intro, then a body that fills to the same bottom edge). */
export default function Makers() {
  return (
    <section id="makers" className="wrap mt-16 grid gap-12 border-y border-white/[0.08] py-14 sm:mt-20 lg:grid-cols-2 lg:gap-0 lg:py-16">
      <Reveal className="flex h-full flex-col lg:pr-10">
        <Tag>For makers</Tag>
        <h2 className="mt-6 text-balance text-[34px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[44px]">Publish a curve. <span className="text-white/60">Earn the spread without a bot.</span></h2>
        <p className="mt-4 min-h-[48px] max-w-[440px] text-[14px] leading-relaxed text-white/65">Set your range and shape once. Try it: pick a shape and drag how much a taker buys.</p>
        <div className="mt-6 flex-1"><CurveBuilder /></div>
      </Reveal>

      <Reveal delay={0.08} className="flex h-full flex-col lg:border-l lg:border-white/[0.08] lg:pl-10">
        <Tag>Safety</Tag>
        <h2 className="mt-6 text-balance text-[34px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[44px]">Safe by construction, <span className="text-white/60">not by trust.</span></h2>
        <p className="mt-4 min-h-[48px] max-w-[440px] text-[14px] leading-relaxed text-white/65">Four rules the contract enforces itself, whatever the owner or a solver does.</p>
        <div className="mt-6 grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
          {GUARANTEES.map(([k, d]) => (
            <div key={k} className="flex flex-col rounded-[18px] border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-mint/35">
              <p className="font-mono text-[15px] font-medium text-mint">{k}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-white/70">{d}</p>
            </div>
          ))}
          <div className="rounded-[18px] border border-dashed border-white/15 p-5 sm:col-span-2">
            <p className="text-[14px] leading-relaxed text-white/70"><span className="font-medium text-white">Open to every chain.</span> The same curves are designed to answer NEAR Intents swap requests, so users on other chains can fill against Ebbflow liquidity.</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
