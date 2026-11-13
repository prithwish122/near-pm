"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { ASK_CAPACITY, BEST_ASK, BEST_BID, BID_CAPACITY, baseForQuote, route, totals } from "@/lib/curve";

const SLIPPAGE = 0.005;
const REFRESH = 34 * 60 + 32;
const trim = (n: number, d: number) => (isFinite(n) ? String(parseFloat(n.toFixed(d))) : "");
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const sanitize = (v: string) => v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

function Token({ symbol, color, glyph }: { symbol: string; color: string; glyph: string }) {
  return (
    <span className="flex h-9 items-center gap-2 rounded-lg bg-white/[0.06] pl-1.5 pr-3 text-xs text-white/90">
      <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-ink" style={{ background: color }}>{glyph}</span>
      {symbol}
    </span>
  );
}
const WNEAR = { symbol: "wNEAR", color: "#d8f5e6", glyph: "N" };
const TUSDC = { symbol: "tUSDC", color: "#55ffb0", glyph: "$" };

export default function SwapCard() {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [src, setSrc] = useState<"base" | "quote">("base"); // which field the user typed in
  const [baseVal, setBaseVal] = useState("200");
  const [quoteVal, setQuoteVal] = useState("");
  const [secs, setSecs] = useState(REFRESH);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s <= 1 ? REFRESH : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const cap = side === "buy" ? ASK_CAPACITY : BID_CAPACITY;
  // Resolve the base (wNEAR) size from whichever field the user edited.
  const base = useMemo(() => {
    if (src === "base") return parseFloat(baseVal) || 0;
    return baseForQuote(side, parseFloat(quoteVal) || 0);
  }, [src, baseVal, quoteVal, side]);

  const over = base === null || base > cap;
  const legs = useMemo(() => (over || !base ? [] : route(side, base) ?? []), [over, base, side]);
  const t = totals(legs);
  const best = side === "buy" ? BEST_ASK : BEST_BID;
  const impact = t.base ? Math.abs(Math.round(((t.avg - best) / best) * 1e4)) : 0;
  const limit = side === "buy" ? t.quote * (1 + SLIPPAGE) : t.quote * (1 - SLIPPAGE);

  const shownBase = src === "base" ? baseVal : t.base ? trim(t.base, 4) : "";
  const shownQuote = src === "quote" ? quoteVal : t.quote ? trim(t.quote, 2) : "";
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  const flip = (s: "buy" | "sell") => { setSide(s); setSrc("base"); setBaseVal(s === "buy" ? "200" : "100"); setMsg(null); };
  const exec = () => {
    if (over) return setMsg({ ok: false, text: `Only ${trim(cap, 2)} wNEAR available on this side of the book.` });
    if (!(t.base > 0)) return setMsg({ ok: false, text: "Enter an amount greater than zero." });
    const extra = side === "buy" ? `Unused input refunded: ${fmt(limit - t.quote)} tUSDC.` : `Minimum received: ${fmt(limit)} tUSDC.`;
    setMsg({ ok: true, text: `Demo route: ${legs.length} maker${legs.length > 1 ? "s" : ""}, one ft_transfer_call. ${extra} No funds moved.` });
  };

  const payTok = side === "buy" ? TUSDC : WNEAR;
  const getTok = side === "buy" ? WNEAR : TUSDC;
  const payIsBase = side === "sell";
  const payVal = payIsBase ? shownBase : shownQuote;
  const getVal = payIsBase ? shownQuote : shownBase;
  const onPay = (v: string) => { setMsg(null); if (payIsBase) { setSrc("base"); setBaseVal(sanitize(v)); } else { setSrc("quote"); setQuoteVal(sanitize(v)); } };
  const onGet = (v: string) => { setMsg(null); if (payIsBase) { setSrc("quote"); setQuoteVal(sanitize(v)); } else { setSrc("base"); setBaseVal(sanitize(v)); } };

  const field = "mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#0f2a1c]/70 px-3 py-2";
  const input = "w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-white/30";

  return (
    <div className="glass relative w-full rounded-[22px] p-5 shadow-[0_30px_80px_-30px_rgba(30,190,110,.55)] sm:p-6" id="buy">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium text-white/90">Trade wNEAR / tUSDC</h2>
        <div role="tablist" aria-label="Side" className="flex rounded-lg bg-white/[0.07] p-0.5 text-[11px]">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={side === s} onClick={() => flip(s)}
              className={`rounded-md px-3 py-1 capitalize transition ${side === s ? "bg-white text-dark" : "text-white/70 hover:text-white"}`}>{s}</button>
          ))}
        </div>
      </div>

      <label htmlFor="pay" className="mt-5 block text-[11px] text-white/80">You pay</label>
      <div className={field}>
        <input id="pay" inputMode="decimal" value={payVal} onChange={(e) => onPay(e.target.value)} className={input} placeholder="0" />
        <Token {...payTok} />
      </div>
      <div className="relative z-10 -my-1 flex justify-center"><span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-[#0d2418] text-white/60"><ArrowDownUp size={12} /></span></div>
      <label htmlFor="get" className="block text-[11px] text-white/80">You get</label>
      <div className={field}>
        <input id="get" inputMode="decimal" value={getVal} onChange={(e) => onGet(e.target.value)} className={input} placeholder="0" />
        <Token {...getTok} />
      </div>

      <div className="mt-3 rounded-lg bg-white/[0.06] p-3" aria-live="polite">
        <p className="text-[10px] uppercase tracking-wider text-white/45">Route · {legs.length ? `${legs.length} maker${legs.length > 1 ? "s" : ""}` : "no route"}</p>
        {legs.length > 0 ? (
          <ul className="mt-1.5 space-y-1 text-[11px] text-white/80">
            {legs.map((l) => (
              <li key={l.maker} className="flex justify-between tabular-nums"><span>{l.maker}</span><span>{fmt(l.base)} wNEAR @ {fmt(l.avg, 4)}</span></li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[11px] text-white/50">{over ? `Only ${trim(cap, 2)} wNEAR available on this side.` : "Enter an amount to see the route."}</p>
        )}
        {legs.length > 0 && (
          <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/60 tabular-nums">Avg {fmt(t.avg, 4)} · impact {impact} bps · {side === "buy" ? "max spend" : "min receive"} {fmt(limit)} tUSDC</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-white/55">Quote refreshes in <span className="tabular-nums text-white/80">{mm} : {ss}</span></p>
      <p className="mt-1 text-center text-[10px] text-white/40">Demo book from the spec · 0.5% slippage · testnet only</p>

      <button onClick={exec} className="mt-4 h-11 w-full rounded-lg bg-white text-[13px] font-medium text-dark transition hover:bg-mint2 active:scale-[.99]">
        Execute (1 tx)
      </button>
      {msg && <p role="status" className={`mt-3 text-center text-[11px] ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
    </div>
  );
}
