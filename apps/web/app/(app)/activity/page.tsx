"use client";
import { Repeat2 } from "lucide-react";
import { Card, Notice, PageHead, Skeleton } from "@/components/app/ui";
import { BOOK, MARKETS, accountUrl } from "@/lib/config";
import { fmtUnits, shortAccount, timeAgo } from "@/lib/format";
import { view } from "@/lib/rpc";
import { usePolling } from "@/lib/usePolling";
import { formatPrice, PRICE_SCALE } from "@ebbflow/curve-math";

interface Fill { position_id: string; maker_id: string; taker_id: string; market_id: number; side: "buy_base" | "sell_base"; base_amount: string; quote_amount: string; new_price: string; recycled_amount: string; recycled_to: string; timestamp_ms: number }

export default function ActivityPage() {
  const m = MARKETS[0]!;
  const { data, loading, error } = usePolling(() => view<Fill[]>(BOOK, "get_recent_fills", { limit: 100 }), [], 5000);
  const unit = 10n ** BigInt(m.base_decimals);
  const recycledLabel = (f: Fill) => {
    const amt = f.recycled_to === "ask" ? `${fmtUnits(f.recycled_amount, m.base_decimals, 4)} ${m.baseSymbol}` : `${fmtUnits(f.recycled_amount, m.quote_decimals, 4)} ${m.quoteSymbol}`;
    return f.recycled_to === "balance" ? `${amt} → maker balance` : `${amt} → ${f.recycled_to} side`;
  };

  return (
    <>
      <PageHead title="Activity" sub="The latest fills from the book's on-chain ring buffer. Each fill shows what the maker's proceeds recycled into." />
      {error && <div className="mb-5"><Notice tone="error" title="Could not load fills">{error.message}</Notice></div>}
      <Card title="Recent fills" aside={<span className="text-[11px] text-white/45">Updates every 5 s</span>}>
        {loading && !data ? <Skeleton className="h-48" /> : !data?.length ? <p className="text-[13px] text-white/60">No fills yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px] tabular-nums">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="pb-2 font-normal">Time</th><th className="pb-2 font-normal">Taker</th><th className="pb-2 font-normal">Maker</th><th className="pb-2 font-normal">Side</th><th className="pb-2 text-right font-normal">Size</th><th className="pb-2 text-right font-normal">Price</th><th className="pb-2 pl-4 font-normal">Recycled</th>
              </tr></thead>
              <tbody>
                {data.map((f, i) => {
                  const base = BigInt(f.base_amount);
                  const px = base === 0n ? "—" : formatPrice((BigInt(f.quote_amount) * unit * PRICE_SCALE) / base, m.quote_decimals, 4);
                  return (
                    <tr key={`${f.timestamp_ms}-${f.position_id}-${i}`} className="border-t border-white/5">
                      <td className="py-2.5 pr-3 text-white/60">{timeAgo(f.timestamp_ms)}</td>
                      <td className="py-2.5 pr-3"><a className="hover:underline" href={accountUrl(f.taker_id)} target="_blank" rel="noreferrer">{shortAccount(f.taker_id, 24)}</a></td>
                      <td className="py-2.5 pr-3"><a className="hover:underline" href={accountUrl(f.maker_id)} target="_blank" rel="noreferrer">{shortAccount(f.maker_id, 24)}</a></td>
                      <td className="py-2.5 pr-3"><span className={f.side === "buy_base" ? "text-mint" : "text-sky-300"}>{f.side === "buy_base" ? "Buy" : "Sell"}</span></td>
                      <td className="py-2.5 text-right">{fmtUnits(f.base_amount, m.base_decimals, 4)} {m.baseSymbol}</td>
                      <td className="py-2.5 text-right">{px}</td>
                      <td className="py-2.5 pl-4"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/80"><Repeat2 size={11} />{recycledLabel(f)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
