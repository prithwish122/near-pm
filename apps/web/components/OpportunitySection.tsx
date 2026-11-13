import { Spline, Split, Repeat2, ShieldCheck, Target, Bot } from "lucide-react";
import FeatureCard from "./FeatureCard";
import Reveal from "./Reveal";

const cards = [
  { icon: Spline, title: "Curve pricing", text: "Pick a range and a shape. The more a taker takes, the further along the curve they move, so makers are never emptied at one price." },
  { icon: Split, title: "Multi-maker routing", text: "A solver splits your trade across up to 8 makers for the best total price." },
  { icon: Repeat2, title: "Inventory recycling", text: "What a maker earns refills the other side of the curve without moving its price. No bot, no extra transaction." },
  { icon: ShieldCheck, title: "Atomic settlement", text: "One ft_transfer_call. Every leg fills in a single receipt, or you are refunded in full.", highlight: true },
  { icon: Target, title: "Limit orders built in", text: "Set start price equal to end price and the curve collapses to a single price. Same code path." },
  { icon: Bot, title: "Agent economy", text: "MCP tools let AI agents quote, simulate and trade from a budget-capped sub-account." },
];

export default function OpportunitySection() {
  return (
    <section id="products" className="opp-bg relative overflow-hidden rounded-[26px] pb-14 pt-20 sm:pt-24">
      <div className="wrap">
        <Reveal className="text-center">
          <span className="pill border-dark/20 bg-white/60 text-dark/70">How it works</span>
          <h2 className="mx-auto mt-6 max-w-[760px] text-[30px] font-normal leading-[1.15] tracking-[-0.015em] text-dark sm:text-[44px]">
            One order, a whole curve of liquidity.
          </h2>
          <p className="mx-auto mt-5 max-w-[380px] text-[12px] leading-relaxed text-dark/60">
            On most order books an order is one price. On Ebbflow makers set a range and a shape once, and three mechanics do the rest.
          </p>
        </Reveal>
        <div className="mt-24 grid gap-4 sm:mt-36 sm:grid-cols-2 lg:mt-48 lg:grid-cols-3 lg:gap-5">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 0.07} className="h-full"><FeatureCard {...c} /></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
