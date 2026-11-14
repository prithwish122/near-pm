/* A small picture of what each docs article is about, used on the landing cards and atop the article.
 * Drawn from what the article actually says, not decoration. */

const MONO = "font-mono";

/** Curve maths: the marginal-price formula and the curve family for each shape (k = 1..4). */
function CurveMath({ big }: { big?: boolean }) {
  const ks = [1, 2, 3, 4];
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <p className={`${MONO} ${big ? "text-[15px]" : "text-[12px]"} text-white/85`}>
        p(x) = p<sub>c</sub> + (p<sub>e</sub> − p<sub>c</sub>)·x<sup className="text-mint">k</sup>
      </p>
      <svg viewBox="0 0 120 70" preserveAspectRatio="none" className={`${big ? "h-40" : "h-20"} w-full`} aria-hidden>
        {ks.map((k, i) => {
          const d = Array.from({ length: 41 }, (_, j) => { const x = j / 40; return `${j ? "L" : "M"}${(6 + x * 108).toFixed(1)},${(64 - Math.pow(x, k) * 56).toFixed(1)}`; }).join(" ");
          return <path key={k} d={d} fill="none" stroke={i === 1 ? "#35dc90" : "rgba(162,255,208,.38)"} strokeWidth={i === 1 ? 1.8 : 1.1} vectorEffect="non-scaling-stroke" />;
        })}
        <path d="M6 64 H114" stroke="rgba(255,255,255,.18)" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className={`${MONO} flex justify-between text-[10.5px] uppercase tracking-[0.05em] text-white/60`}>
        {ks.map((k) => <span key={k} className={k === 2 ? "text-mint" : ""}>k={k}</span>)}
      </p>
    </div>
  );
}

/** Atomic fills: one call in, every leg simulated, then commit or a full refund. */
function Atomic({ big }: { big?: boolean }) {
  const step = (label: string, sub: string, tone: "plain" | "ok" | "back") => (
    <div className={`rounded-lg border ${big ? "px-2.5 py-1.5" : "px-2 py-1"} ${tone === "ok" ? "border-mint/40 bg-mint/10" : tone === "back" ? "border-white/15 bg-white/[0.04]" : "border-white/12 bg-black/30"}`}>
      <p className={`${MONO} whitespace-nowrap ${big ? "text-[12.5px]" : "text-[10.5px]"} ${tone === "ok" ? "text-mint" : "text-white/85"}`}>{label}</p>
      {big && <p className="text-[10.5px] text-white/55">{sub}</p>}
    </div>
  );
  return (
    <div className={`grid h-full w-full items-center ${big ? "grid-cols-[1fr_auto_1fr] gap-2" : "grid-cols-[auto_auto_auto] justify-center gap-1.5"}`}>
      <div className="space-y-2">
        {step("ft_transfer_call", "taker sends input", "plain")}
        {step(big ? "simulate all legs" : "simulate legs", "against every curve", "plain")}
      </div>
      <svg viewBox="0 0 20 60" className={big ? "h-16 w-5" : "h-12 w-4"} aria-hidden><path d="M2 30 H10 M10 30 L18 12 M10 30 L18 48" stroke="rgba(162,255,208,.6)" strokeWidth="1.4" fill="none" /></svg>
      <div className="space-y-2">
        {step("commit", "every leg, one receipt", "ok")}
        {step("refund", "limit missed: all back", "back")}
      </div>
    </div>
  );
}

/** Agents over MCP: the tools an agent gets, read tools first. */
function Agents({ big }: { big?: boolean }) {
  const read = ["list_markets", "get_liquidity", "get_quote", "simulate_route", "compare_liquidity"];
  const write = ["execute_swap", "get_agent_balance"];
  const chip = (t: string, w: boolean) => (
    <span key={t} className={`${MONO} rounded-md border ${big ? "px-2 py-1 text-[12px]" : "px-1.5 py-0.5 text-[10px]"} ${w ? "border-mint/40 bg-mint/10 text-mint" : "border-white/12 bg-black/30 text-white/80"}`}>{t}</span>
  );
  return (
    <div className={`flex h-full w-full flex-col justify-center ${big ? "gap-2.5" : "gap-1.5"}`}>
      <div className="flex flex-wrap gap-1">{read.map((t) => chip(t, false))}</div>
      <div className="flex flex-wrap gap-1">{write.map((t) => chip(t, true))}</div>
      <p className={`${MONO} text-[10px] uppercase tracking-[0.05em] text-white/60`}>{big ? "read: no keys · write: capped sub-account" : "read: no keys · write: capped"}</p>
    </div>
  );
}

export default function DocArt({ slug, big }: { slug: string; big?: boolean }) {
  if (slug === "curve-maths-explained") return <CurveMath big={big} />;
  if (slug === "atomic-fills-on-near") return <Atomic big={big} />;
  return <Agents big={big} />;
}

/** Rough reading time for an article body. */
export const minutes = (body: string[]) => Math.max(1, Math.round(body.join(" ").split(/\s+/).length / 200));
