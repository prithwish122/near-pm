"use client";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import CoinO from "./CoinO";

const STACK = ["NEAR", "NEAR Intents", "Rust", "TypeScript", "MCP"];
const EASE = [0.22, 1, 0.36, 1] as const;
/** What the preview shows, pinned to where it is on the screenshot (fractions of the image). */
const CALLOUTS = [
  { text: "Every maker's curve, summed", x: 0.3, y: 0.42 },
  { text: "Rows are slices of maker curves", x: 0.62, y: 0.55 },
  { text: "One transaction, many makers", x: 0.84, y: 0.68 },
];

/** Centred hero in the original green card: headline on black, and the real Trade screen rising out of the green. */
export default function Hero() {
  const still = useReducedMotion();
  const { scrollY } = useScroll();
  const s = useSpring(scrollY, { stiffness: 140, damping: 30, mass: 0.4 });
  const textY = useTransform(s, [0, 700], [0, still ? 0 : -80]);
  const textFade = useTransform(s, [0, 500], [1, 0]);
  // the app preview starts tipped back and flattens as you scroll toward it
  const tilt = useTransform(s, [0, 420], [still ? 0 : 16, 0]);
  const shotY = useTransform(s, [0, 420], [0, still ? 0 : -30]);
  const up = (d: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay: d, ease: EASE } });

  return (
    <section id="top" className="hero-bg relative flex flex-col overflow-hidden rounded-[26px]">
      <div aria-hidden className="drift pointer-events-none absolute -left-[10%] bottom-[22%] h-[40%] w-[70%] rounded-full bg-accent/25 blur-[120px]" />
      <div aria-hidden className="h-14" />

      <motion.div style={{ y: textY, opacity: textFade }} className="wrap relative z-[1] flex flex-col items-center pt-10 text-center sm:pt-14">
        <motion.span {...up(0)} className="pill border-white/10 bg-black/40 text-white/80">NEAR Hackathon 2026 · Unstoppable DeFi</motion.span>
        <motion.h1 {...up(0.08)} className="mt-8 text-[clamp(44px,7vw,100px)] font-normal leading-[0.98] tracking-[-0.035em] text-white">
          {/* the "o" of "order" is the Ebbflow coin */}
          Every <span className="sr-only">order</span><span aria-hidden className="whitespace-nowrap"><CoinO />rder</span> is a curve,<br /><span className="text-white/60">not a price.</span>
        </motion.h1>
        <motion.p {...up(0.16)} className="mt-6 max-w-[470px] text-[14px] leading-relaxed text-white/70">
          Ebbflow brings shaped, self-refilling maker liquidity to NEAR. One transaction fills across many makers, all or nothing, and what a maker earns refills the other side of their curve.
        </motion.p>
        <motion.div {...up(0.24)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/trade" className="group inline-flex h-11 items-center gap-2 rounded-full bg-accent pl-5 pr-4 text-[14px] font-semibold text-ink transition-colors hover:bg-mint">
            Launch app<ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="#how" className="inline-flex h-11 items-center rounded-full border border-white/15 bg-black/30 px-5 text-[14px] text-white/85 backdrop-blur transition-colors hover:border-white/40">How it works</Link>
        </motion.div>
        <motion.ul {...up(0.3)} aria-label="Built with" className="mt-7 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12.5px] text-white/60">
          <li className="text-white/45">Built with</li>
          {STACK.map((x) => <li key={x} className="font-medium text-white/75">{x}</li>)}
        </motion.ul>
      </motion.div>

      {/* the real app: the Trade screen, in a browser frame, cut off by the card's bottom edge */}
      {/* -mb: the frame runs past the card's bottom edge and is cut off by it, so there is no gap under it */}
      <motion.div {...up(0.32)} className="wrap relative -mb-16 mt-12 sm:mt-14" style={{ perspective: 1600 }}>
        <motion.div style={{ rotateX: tilt, y: shotY, transformOrigin: "50% 0%" }} className="mx-auto max-w-[1120px]">
          <Link href="/trade" aria-label="Open the Ebbflow trade screen"
            className="group block overflow-hidden rounded-t-[18px] border border-b-0 border-white/20 bg-[#0b0d0c] shadow-[0_-40px_120px_-30px_rgba(53,220,144,.6)] ring-1 ring-black/40 transition-[border-color] duration-500 hover:border-mint/50">
            <div className="flex items-center gap-3 border-b border-white/10 bg-[#111413] px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>{["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full opacity-70" style={{ background: c }} />)}</span>
              <span className="mx-auto rounded-md bg-white/[0.06] px-3 py-1 font-mono text-[11px] text-white/65">ebbflow · trade</span>
              <span className="hidden items-center gap-1 text-[11.5px] text-mint sm:inline-flex">Open app<ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" /></span>
            </div>
            <div className="relative h-[36svh] min-h-[230px] overflow-hidden sm:h-[48svh] lg:h-[58svh]">
              {/* the image keeps its own proportions, so the callouts stay pinned to the right spots */}
              <div className="relative w-full" style={{ aspectRatio: "2836 / 1560" }}>
                <Image src="/landing/trade.jpg" alt="The Ebbflow trade screen on testnet: market stats, liquidity by price, the order book and the swap panel."
                  fill priority quality={90} sizes="(min-width: 1220px) 1120px, 100vw" className="object-cover object-top" />
                {CALLOUTS.map((c, i) => (
                  // outer span centres the callout on its point; the inner one animates (its transform would override the centring)
                  <span key={c.text} className="absolute hidden -translate-x-1/2 -translate-y-1/2 lg:block" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
                    <motion.span initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, delay: 1 + i * 0.15, ease: EASE }}
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-mint/40 bg-[#07110a]/90 py-1.5 pl-2.5 pr-3.5 text-[12.5px] text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,.8)] backdrop-blur">
                      <span className="live-dot" />{c.text}
                    </motion.span>
                  </span>
                ))}
              </div>
            </div>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
