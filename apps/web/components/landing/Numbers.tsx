"use client";
import Reveal from "../Reveal";
import OutlineCard from "./OutlineCard";
import { MARKET, NETWORK } from "@/lib/config";
import { DEMO_BUY, fmt, shortName, useLive } from "./live";

/**
 * Three numbers, each backed by the live book: one real quote (buy 2 wNEAR) shows how many makers
 * share a swap, what the single transaction pays and gets, and what one maker's position refilled.
 */
export default function Numbers() {
  const { quote } = useLive();
  const legs = quote?.legs ?? [];
  const makers = new Set(legs.map((l) => l.maker)).size;
  const leg0 = legs[0];

  const cards = [
    {
      n: "8", label: "makers can fill a single swap",
      text: "A solver splits your order across up to eight maker curves for the best total price.",
      live: quote && (
        <>
          <p>Buy {DEMO_BUY} {MARKET.baseSymbol} right now: {legs.length} legs from {makers} makers</p>
          <ul className="mt-2 space-y-1 text-white/65">
            {legs.slice(0, 4).map((l, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{shortName(l.maker)}</span><span>{fmt(l.base_amount, 3)}</span></li>)}
          </ul>
        </>
      ),
    },
    {
      n: "1", label: "transaction, all or nothing",
      text: "One ft_transfer_call carries every leg. All settle in one receipt, or you are refunded in full.",
      live: quote && (
        <>
          <p>Pay {fmt(quote.amount_in)} {MARKET.quoteSymbol}</p>
          <p>Get {fmt(quote.amount_out)} {MARKET.baseSymbol}</p>
          <p className="mt-2 text-white/65">Avg {fmt(quote.avg_price)} · impact {(quote.price_impact_bps / 100).toFixed(2)}%</p>
        </>
      ),
    },
    {
      n: "0", label: "bots needed to refill liquidity",
      text: "What a maker earns flows into the bid side of the same position, without moving its price.",
      live: leg0 && (
        <>
          <p>{shortName(leg0.maker)} · position #{leg0.position_id}</p>
          <p className="mt-2 text-white/65">−{fmt(leg0.base_amount, 3)} {MARKET.baseSymbol} sold</p>
          <p className="text-mint">+{fmt(leg0.quote_amount, 3)} {MARKET.quoteSymbol} back on the bid</p>
        </>
      ),
    },
  ];

  return (
    <section aria-label="Ebbflow by the numbers" className="wrap pt-16 sm:pt-20">
      <Reveal className="mb-8 text-center sm:mb-10">
        <h2 className="text-balance text-[26px] font-normal tracking-[-0.02em] sm:text-[34px]">One live quote, <span className="text-white/60">three numbers.</span></h2>
        <p className="mt-2 text-[14px] text-white/60">What buying {DEMO_BUY} {MARKET.baseSymbol} on the {NETWORK} book looks like right now.</p>
      </Reveal>
      {/* Three black cards whose outline and number are one drawing: the border breaks at the top right
          and the numeral is drawn in the same line. "Live" stays on the left. */}
      <div className="grid gap-x-5 gap-y-20 pt-16 md:grid-cols-3 md:pt-20">
        {cards.map((c, i) => (
          <Reveal key={c.n} delay={i * 0.08} className="h-full">
            <OutlineCard n={c.n}>
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.07em] text-white/70"><span className="live-dot" />Live</p>
              <h3 className="mt-6 max-w-[62%] text-[20px] font-medium leading-snug tracking-[-0.01em] text-white"><span className="sr-only">{c.n} </span>{c.label}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/65">{c.text}</p>
              <div className="mt-auto pt-6">
                <div className="border-t border-white/10 pt-4 font-mono text-[11.5px] leading-relaxed text-white/85">
                  {c.live ?? <p className="text-white/60">Waiting for the book…</p>}
                </div>
              </div>
            </OutlineCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
