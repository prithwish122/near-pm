"use client";
import { useEffect, useRef } from "react";
import { compact, type Level } from "@/lib/book";
import { cx } from "./ui";

interface Props {
  asks: Level[];
  bids: Level[];
  digits: number;
  baseSymbol: string;
  spread: number | null;
  spreadPct: number | null;
  onPick: (side: "ask" | "bid", l: Level) => void;
  rows?: number;
  /** Worst price the current quote reaches; rows up to it are highlighted. */
  fillTo?: number | null;
  fillSide?: "ask" | "bid";
}

/** Remembers each price's last size so a changed row flashes up or down (kept for ~1s). */
function useFlash(levels: Level[]) {
  const prev = useRef(new Map<number, number>());
  const live = useRef(new Map<number, { dir: "up" | "down"; until: number }>());
  const now = Date.now();
  for (const l of levels) {
    const p = prev.current.get(l.price);
    if (p !== undefined && Math.abs(p - l.size) > 1e-9) live.current.set(l.price, { dir: l.size > p ? "up" : "down", until: now + 1000 });
  }
  useEffect(() => { prev.current = new Map(levels.map((l) => [l.price, l.size])); });
  const out = new Map<number, "up" | "down">();
  live.current.forEach((v, k) => { if (v.until > now) out.set(k, v.dir); else live.current.delete(k); });
  return out;
}

function Row({ l, side, max, digits, flash, onPick, inFill }: { l: Level; side: "ask" | "bid"; max: number; digits: number; flash?: "up" | "down"; onPick: () => void; inFill?: boolean }) {
  const ask = side === "ask";
  return (
    <button onClick={onPick} title={`${ask ? "Buy" : "Sell"} through ${l.price.toFixed(digits)}`}
      className={cx("group relative grid w-full grid-cols-3 px-3 py-[3px] text-right text-[12px] transition-colors hover:bg-white/[0.06]", inFill && "bg-white/[0.05]", flash === "up" && "flash-up", flash === "down" && "flash-down")}>
      <span aria-hidden className={cx("absolute inset-y-[1px] right-0 transition-[width] duration-500 ease-out", ask ? "bg-ask/[0.07]" : "bg-bid/[0.07]")} style={{ width: `${Math.max(2, (l.total / max) * 100)}%` }} />
      <span className={cx("num relative text-left", ask ? "text-ask" : "text-bid")}>{l.price.toFixed(digits)}</span>
      <span className="num relative text-white/85">{compact(l.size)}</span>
      <span className="num relative text-white/50 group-hover:text-white/80">{compact(l.total)}</span>
    </button>
  );
}

export default function OrderBook({ asks, bids, digits, baseSymbol, spread, spreadPct, onPick, rows = 11, fillTo, fillSide }: Props) {
  const inFill = (side: "ask" | "bid", p: number) => fillTo != null && fillSide === side && (side === "ask" ? p <= fillTo + 1e-9 : p >= fillTo - 1e-9);
  const a = asks.slice(0, rows);
  const b = bids.slice(0, rows);
  const fa = useFlash(a);
  const fb = useFlash(b);
  const maxA = Math.max(1e-12, ...a.map((l) => l.total));
  const maxB = Math.max(1e-12, ...b.map((l) => l.total));
  return (
    <div className="text-[12px]">
      <div className="grid grid-cols-3 px-3 pb-1.5 pt-2 text-right text-[10.5px] text-white/40">
        <span className="text-left">Price</span><span>Size ({baseSymbol})</span><span>Total</span>
      </div>
      <div className="flex flex-col justify-end" style={{ minHeight: rows * 22 }}>
        {[...a].reverse().map((l) => <Row key={`${l.price}:${l.size.toFixed(9)}`} l={l} side="ask" max={maxA} digits={digits} flash={fa.get(l.price)} inFill={inFill("ask", l.price)} onPick={() => onPick("ask", l)} />)}
        {!a.length && <p className="py-6 text-center text-white/35">No asks</p>}
      </div>
      <div className="my-1 flex items-center justify-between border-y border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11.5px]">
        <span className="text-white/45">Spread</span>
        <span className="num text-white/80">{spread != null ? spread.toFixed(digits) : "—"}</span>
        <span className="num text-white/45">{spreadPct != null ? `${spreadPct.toFixed(3)}%` : ""}</span>
      </div>
      <div style={{ minHeight: rows * 22 }}>
        {b.map((l) => <Row key={`${l.price}:${l.size.toFixed(9)}`} l={l} side="bid" max={maxB} digits={digits} flash={fb.get(l.price)} inFill={inFill("bid", l.price)} onPick={() => onPick("bid", l)} />)}
        {!b.length && <p className="py-6 text-center text-white/35">No bids</p>}
      </div>
    </div>
  );
}
