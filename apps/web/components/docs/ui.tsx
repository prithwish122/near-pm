import type { ReactNode } from "react";
import { AlertTriangle, Info, Lightbulb, ShieldCheck } from "lucide-react";
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
import CodeBlock from "./CodeBlock";

export { CodeBlock };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : "";

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  const anchor = id ?? slugify(textOf(children));
  return (
    <h2 id={anchor} data-toc="2" className="group mt-14 scroll-mt-24 border-t border-white/[0.07] pt-10 text-[24px] font-medium tracking-[-0.02em] text-white first:mt-0 first:border-t-0 first:pt-0">
      <a href={`#${anchor}`} className="no-underline">{children}<span className="ml-2 text-white/0 transition-colors group-hover:text-white/30">#</span></a>
    </h2>
  );
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  const anchor = id ?? slugify(textOf(children));
  return (
    <h3 id={anchor} data-toc="3" className="group mt-9 scroll-mt-24 text-[18px] font-medium tracking-[-0.01em] text-white">
      <a href={`#${anchor}`}>{children}<span className="ml-2 text-white/0 transition-colors group-hover:text-white/30">#</span></a>
    </h3>
  );
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("mt-4 text-[15px] leading-[1.8] text-white/75", className)}>{children}</p>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[17px] leading-[1.75] text-white/85">{children}</p>;
}

/** Inline code. */
export function C({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.82em] text-mint">{children}</code>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const ext = href.startsWith("http");
  return (
    <a href={href} target={ext ? "_blank" : undefined} rel={ext ? "noreferrer" : undefined} className="text-mint underline decoration-mint/30 underline-offset-[3px] transition-colors hover:decoration-mint">
      {children}
    </a>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-4 space-y-2 pl-5 text-[15px] leading-[1.75] text-white/75 marker:text-emerald/70 [list-style:disc]">{children}</ul>;
}
export function OL({ children }: { children: ReactNode }) {
  return <ol className="mt-4 space-y-2 pl-5 text-[15px] leading-[1.75] text-white/75 marker:font-mono marker:text-[12px] marker:text-emerald/80 [list-style:decimal]">{children}</ol>;
}

const CALLOUT = {
  note: { Icon: Info, cls: "border-sky-300/20 bg-sky-300/[0.05]", icon: "text-sky-300", label: "Note" },
  tip: { Icon: Lightbulb, cls: "border-emerald/25 bg-emerald/[0.06]", icon: "text-emerald", label: "Tip" },
  warn: { Icon: AlertTriangle, cls: "border-amber-300/25 bg-amber-300/[0.06]", icon: "text-amber-200", label: "Important" },
  safe: { Icon: ShieldCheck, cls: "border-emerald/25 bg-emerald/[0.06]", icon: "text-emerald", label: "Guarantee" },
};

export function Callout({ type = "note", title, children }: { type?: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  const c = CALLOUT[type];
  return (
    <div className={cx("mt-6 flex gap-3 rounded-xl border px-4 py-3.5", c.cls)}>
      <c.Icon size={17} className={cx("mt-[3px] shrink-0", c.icon)} />
      <div className="min-w-0 text-[14px] leading-[1.7] text-white/80">
        <p className="font-medium text-white">{title ?? c.label}</p>
        <div className="mt-1 [&>p:first-child]:mt-0 [&_p]:text-[14px]">{children}</div>
      </div>
    </div>
  );
}

/** A display formula. Children are plain text; use unicode maths. */
export function Formula({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/30 px-5 py-4">
      {label && <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/45">{label}</p>}
      <div className="whitespace-pre font-mono text-[14px] leading-[1.9] text-mint2">{children}</div>
    </div>
  );
}

export function Table({ head, rows, align, compact }: { head: ReactNode[]; rows: ReactNode[][]; align?: ("l" | "r" | "c")[]; compact?: boolean }) {
  const al = (i: number) => (align?.[i] === "r" ? "text-right tabular-nums" : align?.[i] === "c" ? "text-center" : "text-left");
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full border-collapse text-[13.5px]">
        <thead className="bg-white/[0.04]">
          <tr>{head.map((h, i) => <th key={i} className={cx("whitespace-nowrap border-b border-white/[0.08] px-4 py-2.5 font-medium text-white/90", al(i))}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.05] last:border-b-0 even:bg-white/[0.015]">
              {r.map((c, j) => <td key={j} className={cx("align-top text-white/75", compact ? "px-4 py-2" : "px-4 py-2.5", al(j))}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-6 space-y-0 [counter-reset:step]">{children}</ol>;
}

export function Step({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <li className="relative border-l border-white/[0.1] pb-7 pl-8 last:border-transparent last:pb-0 [counter-increment:step] before:absolute before:-left-[13px] before:top-0 before:grid before:h-[26px] before:w-[26px] before:place-items-center before:rounded-full before:border before:border-emerald/40 before:bg-ink before:font-mono before:text-[11px] before:text-emerald before:content-[counter(step)]">
      <p className="pt-0.5 text-[15.5px] font-medium text-white">{title}</p>
      <div className="text-[15px] [&>*:first-child]:mt-2">{children}</div>
    </li>
  );
}

/** Small labelled figures in a row. */
export function Stats({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3.5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/45">{s.label}</p>
          <p className="mt-1.5 text-[20px] font-medium tabular-nums tracking-[-0.01em] text-white">{s.value}</p>
          {s.sub && <p className="mt-0.5 text-[12px] text-white/50">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** A labelled box-and-arrow flow, top to bottom. */
export function Flow({ steps }: { steps: { who: string; what: ReactNode }[] }) {
  return (
    <div className="mt-6 space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex w-6 shrink-0 flex-col items-center">
            <span className="mt-3 h-2 w-2 rounded-full bg-emerald" />
            {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-white/[0.12]" />}
          </div>
          <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-emerald/80">{s.who}</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-white/80">{s.what}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
