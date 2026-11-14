import { Check } from "lucide-react";
import Reveal from "../Reveal";

type Status = "shipped" | "next" | "later";
/** What has shipped and what comes next, taken from the repo and the docs. */
const STEPS: { status: Status; title: string; text: string }[] = [
  { status: "shipped", title: "NEAR Intents solver", text: "Curves answer Intents swaps; fund from other chains with 1Click." },
  { status: "shipped", title: "Mainnet switch", text: "The app runs on testnet or mainnet from one setting." },
  { status: "next", title: "Per-maker vaults", text: "Each maker's funds in their own sub-account." },
  { status: "next", title: "Agent vault", text: "On-chain per-trade and daily limits for agents." },
  { status: "later", title: "Audit, then mainnet", text: "An external audit before real funds go in." },
];
const LABEL: Record<Status, string> = { shipped: "Shipped", next: "Next", later: "Later" };
const shippedCount = STEPS.filter((s) => s.status === "shipped").length;

/** A milestone on the timeline. Shipped: filled and glowing. The step being worked on now: a pulsing ring. Later: a dashed ring. */
function Node({ status, i, current }: { status: Status; i: number; current: boolean }) {
  if (status === "shipped")
    return (
      <span className="relative grid h-9 w-9 place-items-center rounded-full bg-mint text-[#06140c] shadow-[0_0_0_6px_rgba(162,255,208,.12),0_0_28px_rgba(162,255,208,.55)]">
        <Check size={16} strokeWidth={3} />
      </span>
    );
  return (
    <span className={`relative grid h-9 w-9 place-items-center rounded-full bg-[#07110a] font-mono text-[11px] ${status === "next" ? "border-2 border-white/70 text-white" : "border-2 border-dashed border-white/35 text-white/55"}`}>
      {current && <span aria-hidden className="roadmap-ping absolute inset-[-2px] rounded-full border-2 border-mint/70" />}
      {String(i + 1).padStart(2, "0")}
    </span>
  );
}

const tone = (s: Status) => (s === "shipped" ? "text-mint" : s === "next" ? "text-white/80" : "text-white/50");

/** The green band, dark at the top and glowing into the mint footer, with the roadmap as one timeline. */
export default function Closing() {
  // nodes sit at the centre of each column; "today" is halfway between the last shipped step and the next
  const today = shippedCount / STEPS.length;
  const lineStart = 0.5 / STEPS.length, lineEnd = 1 - lineStart;
  const solid = ((today - lineStart) / (lineEnd - lineStart)) * 100;
  return (
    <section className="news-bg relative mt-20 overflow-hidden pb-16 pt-14 sm:mt-24 sm:pb-20 sm:pt-16">
      <Reveal className="wrap relative">
        <div className="text-center">
          <span className="pill border-white/15 bg-white/[0.05] text-white/75">Roadmap</span>
          <h2 className="mt-4 text-balance text-[28px] font-normal leading-[1.1] tracking-[-0.025em] sm:text-[40px]">
            What&apos;s shipped, <span className="text-mint">what&apos;s next</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[440px] text-[14px] text-white/65">
            {shippedCount} of {STEPS.length} milestones done. The rest builds toward an audited mainnet launch.
          </p>
        </div>

        {/* wide screens: one horizontal timeline */}
        <div className="relative mx-auto mt-14 hidden max-w-[1120px] md:block">
          {/* a soft glow where "today" is */}
          <div aria-hidden className="pointer-events-none absolute -top-16 h-40 w-72 -translate-x-1/2 rounded-full bg-mint/20 blur-3xl" style={{ left: `${today * 100}%` }} />
          <div aria-hidden className="absolute top-[17px] h-[3px]" style={{ left: `${lineStart * 100}%`, right: `${lineStart * 100}%` }}>
            <div className="roadmap-done absolute inset-y-0 left-0 overflow-hidden rounded-full bg-mint shadow-[0_0_12px_rgba(162,255,208,.6)]" style={{ width: `${solid}%` }} />
            <div className="absolute inset-y-0 right-0 border-t-[3px] border-dashed border-white/25" style={{ left: `${solid}%` }} />
          </div>
          <span className="absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded-full border border-mint/40 bg-[#07110a]/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mint backdrop-blur" style={{ left: `${today * 100}%` }}>
            ● Today
          </span>
          <ol className="relative grid grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="group flex flex-col items-center px-3 text-center">
                <Node status={s.status} i={i} current={i === shippedCount} />
                <p className={`mt-5 font-mono text-[10.5px] uppercase tracking-[0.08em] ${tone(s.status)}`}>{LABEL[s.status]}</p>
                <h3 className={`mt-1.5 text-[16px] font-medium leading-snug ${s.status === "shipped" ? "text-white" : "text-white/85"}`}>{s.title}</h3>
                <p className={`mt-1.5 max-w-[200px] text-[12.5px] leading-relaxed ${s.status === "shipped" ? "text-white/80" : "text-white/70"}`}>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* phones: the same timeline, running down */}
        <ol className="relative mx-auto mt-10 max-w-[420px] md:hidden">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-7 last:pb-0">
              {i < STEPS.length - 1 && (
                <span aria-hidden className={`absolute left-[17px] top-10 bottom-1 w-[3px] ${i < shippedCount - 1 ? "rounded-full bg-mint shadow-[0_0_10px_rgba(162,255,208,.5)]" : "border-l-[3px] border-dashed border-white/25"}`} />
              )}
              <Node status={s.status} i={i} current={i === shippedCount} />
              <div className="pt-1">
                <p className={`font-mono text-[10.5px] uppercase tracking-[0.08em] ${tone(s.status)}`}>{LABEL[s.status]}</p>
                <h3 className="mt-1 text-[15px] font-medium text-white">{s.title}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-white/65">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
