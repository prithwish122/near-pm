"use client";
import { motion } from "framer-motion";
import Navbar from "./Navbar";
import SwapCard from "./SwapCard";
import BrandStrip from "./BrandStrip";

const stats = [["≤ 8", "Makers per swap"], ["1 tx", "All or nothing"], ["0 bots", "Self-refilling"]];

export default function HeroSection() {
  const up = (d: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: [0.22, 1, 0.36, 1] as const } });
  return (
    <section id="top" className="hero-bg relative overflow-hidden rounded-[26px]">
      <div className="drift pointer-events-none absolute -left-[10%] bottom-[18%] h-[40%] w-[70%] rounded-full bg-accent/25 blur-[120px]" aria-hidden />
      <Navbar />
      <div className="wrap relative grid items-start gap-12 pb-24 pt-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:pb-32 lg:pt-16">
        <div>
          <motion.span {...up(0)} className="pill border-white/10 bg-black/40 text-white/80">NEAR Hackathon 2026 · Unstoppable DeFi</motion.span>
          <motion.h1 {...up(0.08)} className="mt-9 text-[44px] font-normal leading-[1.08] tracking-[-0.02em] text-white sm:text-[56px] lg:text-[64px]">
            Every order is<br />a curve, not a price
          </motion.h1>
          <motion.p {...up(0.16)} className="mt-6 max-w-[430px] text-[13px] leading-relaxed text-white/70">
            Ebbflow brings shaped, self-refilling maker liquidity to NEAR. One transaction fills across many makers, all or nothing, and whatever a maker earns refills the other side of their curve with no bot.
          </motion.p>
          <motion.dl {...up(0.24)} className="mt-24 flex gap-10 sm:gap-14 lg:mt-36">
            {stats.map(([v, l]) => (
              <div key={l}>
                <dd className="text-[26px] font-medium leading-none text-white sm:text-[30px]">{v}</dd>
                <dt className="mt-2 text-[11px] text-white/85">{l}</dt>
              </div>
            ))}
          </motion.dl>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }} className="lg:ml-auto lg:max-w-[420px]">
          <SwapCard />
        </motion.div>
      </div>
      <BrandStrip />
    </section>
  );
}
