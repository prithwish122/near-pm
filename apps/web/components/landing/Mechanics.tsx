"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import Reveal from "../Reveal";
import SatinWave from "./SatinWave";
import { DEMO_BUY, fmt, shortName, useLive } from "./live";
import { MARKET } from "@/lib/config";

type Live = ReturnType<typeof useLive>;
const EASE = "cubic-bezier(.22,1,.36,1)";

/** Shared frame for the small charts: faint gridlines and a baseline, drawn in a fixed 120x80 box. */
function Grid() {
  return (
    <g>
      {[20, 40, 60].map((y) => <path key={y} d={`M4 ${y} H116`} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />)}
      <path d="M4 72 H116" stroke="rgba(255,255,255,.2)" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** Reveals its children left to right when `on` turns true (replays each time). Used instead of stroke
 *  dashes, which break when a stretched SVG uses non-scaling strokes. */
function Reveal2({ on, id, children }: { on: boolean; id: string; children: ReactNode }) {
  return (
    <g>
      <defs><clipPath id={id}><rect key={on ? "on" : "off"} x="0" y="0" width="120" height="80" className={on ? "mech-reveal" : ""} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );
}

/** Every live maker curve, faint, with one highlighted; it sweeps in when its card opens. */
function CurveArt({ live, on }: { live: Live; on: boolean }) {
  const all = (live.curves?.positions ?? []).filter((p) => p.points.length > 2 && p.points[0]!.price !== p.points[p.points.length - 1]!.price);
  const lo = all.length ? Math.min(...all.flatMap((p) => p.points.map((q) => q.price))) : 0;
  const hi = all.length ? Math.max(...all.flatMap((p) => p.points.map((q) => q.price))) : 1;
  // each curve in the shared price axis, its depth scaled to its own size so shapes compare
  const toPath = (p: (typeof all)[number]) => {
    const pts = [...p.points].sort((a, b) => a.price - b.price);
    const top = Math.max(...pts.map((q) => q.base)) || 1;
    return pts.map((q, i) => `${i ? "L" : "M"}${(6 + ((q.price - lo) / (hi - lo || 1)) * 108).toFixed(1)},${(72 - (q.base / top) * 58).toFixed(1)}`).join(" ");
  };
  const main = all[0];
  const mainPath = main ? toPath(main) : "M6 72 C 40 68, 70 46, 114 14";
  return (
    <figure>
      <svg viewBox="0 0 120 80" preserveAspectRatio="none" className="h-28 w-full" aria-hidden>
        <defs><linearGradient id="mech-curve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35dc90" stopOpacity=".32" /><stop offset="1" stopColor="#35dc90" stopOpacity="0" /></linearGradient></defs>
        <Grid />
        <Reveal2 on={on} id="mech-curve-clip">
          {all.slice(1).map((p) => <path key={p.position_id} d={toPath(p)} fill="none" stroke={p.side === "ask" ? "rgba(162,255,208,.28)" : "rgba(255,255,255,.22)"} strokeWidth="1.1" vectorEffect="non-scaling-stroke" />)}
          <path d={`${mainPath} L${mainPath.match(/([\d.]+),[\d.]+$/)?.[1] ?? 114},72 L6,72 Z`} fill="url(#mech-curve)" />
          <path d={mainPath} fill="none" stroke="#35dc90" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </Reveal2>
      </svg>
      <figcaption className="mt-2 flex justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-white/60">
        <span>{all.length ? lo.toFixed(3) : "—"}</span>
        <span className="truncate text-mint">{all.length ? `${all.length} curves live` : "waiting for the book"}</span>
        <span>{all.length ? hi.toFixed(3) : "—"}</span>
      </figcaption>
    </figure>
  );
}

/** A curve and a limit order side by side: start = end collapses the curve to one price. */
function LimitArt({ on }: { on: boolean }) {
  return (
    <figure>
      <svg viewBox="0 0 120 80" preserveAspectRatio="none" className="h-28 w-full" aria-hidden>
        <Grid />
        <path d="M6 72 C 40 68, 70 46, 114 14" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.2" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <Reveal2 on={on} id="mech-limit-clip">
          <path d="M6 40 H114" fill="none" stroke="#a2ffd0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d="M6 40 V72 M114 40 V72" stroke="rgba(162,255,208,.35)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        </Reveal2>
      </svg>
      <figcaption className="mt-2 flex justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-white/60">
        <span>start</span><span className={`transition-colors duration-700 ${on ? "text-mint" : ""}`}>start = end</span><span>end</span>
      </figcaption>
    </figure>
  );
}

/** An agent's session, filled with the live quote; it types out line by line when its card opens. */
function AgentArt({ live, on }: { live: Live; on: boolean }) {
  const q = live.quote;
  const lines: [string, string][] = [
    ["›", `get_quote buy ${DEMO_BUY} ${MARKET.baseSymbol}`],
    ["←", q ? `${q.legs.length} legs · avg ${fmt(q.avg_price)}` : "waiting for the book…"],
    ["›", "simulate_route"],
    ["←", q ? `ok · pays ${fmt(q.amount_in, 2)} ${MARKET.quoteSymbol}` : "…"],
    ["›", "execute_swap · capped"],
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-3 font-mono text-[11px] leading-[1.75]">
      {lines.map(([k, v], i) => (
        <p key={i} className={`truncate ${k === "›" ? "text-white/85" : "text-mint/90"}`}
          style={{ opacity: on || i < 2 ? 1 : 0.25, transform: on || i < 2 ? "none" : "translateY(3px)", transition: `opacity .4s ease ${on ? i * 0.18 : 0}s, transform .4s ease ${on ? i * 0.18 : 0}s` }}>
          <span className="mr-2 text-white/45">{k}</span>{v}
        </p>
      ))}
    </div>
  );
}

interface Item { title: string; who: string; short: string; text: string; href: string; cta: string; Art: (p: { live: Live; on: boolean }) => ReactNode }

const ITEMS: Item[] = [
  { title: "Curve pricing", who: "For makers", href: "/make", cta: "Shape a curve", Art: CurveArt,
    short: "A range and a shape, not one price.",
    text: "Pick a range and a shape. The more a taker takes, the further along the curve they move, so a maker is never emptied at one price." },
  { title: "Limit orders built in", who: "For makers and takers", href: "/make", cta: "Place a limit", Art: LimitArt,
    short: "A curve collapsed to one price.",
    text: "Set the start price equal to the end price and the curve collapses to a single price. Same code path, same guarantees." },
  { title: "Agent economy", who: "For AI agents", href: "/articles/trading-with-agents-over-mcp", cta: "Agents over MCP", Art: AgentArt,
    short: "AI agents trade through MCP.",
    text: "MCP tools let AI agents list markets, quote, simulate and trade from a budget-capped sub-account." },
];

/** md and up: the cards sit side by side and the open one widens. Below that they stack, all open. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = matchMedia("(min-width: 768px)");
    const on = () => setWide(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * Three frosted cards. Point at, tab to or tap one and it widens while the others narrow; its picture
 * plays as it opens. Closed cards still show their title, a line and their picture, so none is empty.
 */
export default function Mechanics() {
  const live = useLive();
  const wide = useWide();
  const [open, setOpen] = useState(0);
  return (
    <section id="how" className="relative scroll-mt-14 overflow-hidden pb-20 pt-16 sm:pb-24 sm:pt-20">
      <Reveal className="wrap text-center">
        <h2 className="text-balance text-[32px] font-normal leading-[1.1] tracking-[-0.02em] sm:text-[46px]">
          One order, <span className="text-white/60">a whole curve of liquidity.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-[420px] text-[14px] leading-relaxed text-white/60">
          On most order books an order is one price. On Ebbflow a maker sets a range and a shape once, and the book does the rest.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="wrap relative z-[1] mt-10 sm:mt-12">
        <div className="flex flex-col gap-3 md:h-[420px] md:flex-row">
          {ITEMS.map((it, i) => {
            const on = !wide || i === open;
            return (
              <article key={it.title} onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)} onClick={() => setOpen(i)}
                className={`panel-acc group relative flex min-w-0 flex-col overflow-hidden rounded-[20px] p-5 transition-[flex-grow,border-color,box-shadow] duration-700 sm:p-6 md:basis-0 md:grow ${wide && i === open ? "panel-acc-on" : "hover:border-white/25"}`}
                style={{ flexGrow: wide ? (i === open ? 2.1 : 1) : undefined, transitionTimingFunction: EASE }}>
                {/* light: rests at the top of a closed card and blooms across the open one */}
                <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                  style={{ background: "radial-gradient(75% 55% at 60% 20%, rgba(53,220,144,.32), transparent 70%)", opacity: on ? 1 : 0.4 }} />

                <div className="relative">
                  <p className={`font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-500 ${on ? "text-mint" : "text-white/60"}`}>{it.who}</p>
                  <h3 className="mt-1.5 text-[19px] font-medium leading-tight tracking-[-0.015em] text-white">
                    <button type="button" className="text-left" aria-expanded={on}>{it.title}</button>
                  </h3>
                </div>

                {/* the long description on the open card, the short line on closed ones */}
                <div className="relative mt-4 grid">
                  <p className="col-start-1 row-start-1 max-w-[440px] text-[14px] leading-relaxed text-white/75 transition-opacity duration-500" style={{ opacity: on ? 1 : 0 }} aria-hidden={!on}>{it.text}</p>
                  <p className="col-start-1 row-start-1 text-[14px] leading-relaxed text-white/65 transition-opacity duration-500" style={{ opacity: on ? 0 : 1 }} aria-hidden={on}>{it.short}</p>
                </div>

                <div className="relative mt-auto pt-5">{it.Art({ live, on })}</div>
                <div className="relative overflow-hidden transition-[max-height,opacity,margin] duration-500" style={{ maxHeight: on ? 60 : 0, opacity: on ? 1 : 0, marginTop: on ? 20 : 0 }}>
                  <Link href={it.href} tabIndex={on ? 0 : -1} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-[13px] font-medium text-dark transition-colors hover:bg-mint2">
                    {it.cta}<ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </Reveal>

      {/* the same live sheet as the hero, laid under the cards */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%]">
        <SatinWave className="wave-fade-top h-full w-full" lines={56} amp={0.8} />
      </div>
    </section>
  );
}
