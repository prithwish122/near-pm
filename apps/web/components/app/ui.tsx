"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Flat trading-desk panel. `pad={false}` for tables and charts that run edge to edge. */
export function Card({ children, className, title, aside, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; aside?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("panel rounded-2xl", className)}>
      {(title || aside) && (
        <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-white/[0.06] px-4">
          {title && <h2 className="text-[13px] font-medium text-white/90">{title}</h2>}
          {aside}
        </header>
      )}
      <div className={pad ? "p-4 sm:p-5" : undefined}>{children}</div>
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger" | "buy" | "sell";
export function Btn({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = {
    primary: "bg-accent text-ink hover:bg-mint",
    buy: "bg-bid text-ink hover:brightness-110",
    sell: "bg-ask text-white hover:brightness-110",
    ghost: "border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:border-white/20",
    danger: "border border-ask/40 bg-ask/10 text-rose-200 hover:bg-ask/20",
  }[variant];
  return <button {...p} className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none", v, className)} />;
}

export function Field({ label, suffix, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; suffix?: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = p.id ?? `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[11px] text-white/55">{label}</label>
      <div className={cx("mt-1.5 flex items-center gap-2 rounded-xl border bg-black/40 px-3 py-2.5 transition", error ? "border-ask/60" : "border-white/[0.08] hover:border-white/15 focus-within:border-accent/60")}>
        <input id={id} inputMode="decimal" autoComplete="off" {...p} className="num w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-white/25 disabled:opacity-40" />
        {suffix && <span className="shrink-0 text-xs text-white/55">{suffix}</span>}
      </div>
      {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : hint ? <p className="mt-1 text-[11px] text-white/45">{hint}</p> : null}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label, size = "sm" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; size?: "sm" | "xs" }) {
  return (
    <div role="tablist" aria-label={label} className={cx("inline-flex rounded-lg border border-white/[0.06] bg-black/30 p-0.5", size === "xs" ? "text-[11px]" : "text-[12px]")}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-md transition", size === "xs" ? "px-2 py-1" : "px-3 py-1.5", value === o.value ? "bg-white/[0.1] text-white" : "text-white/50 hover:text-white")}>{o.label}</button>
      ))}
    </div>
  );
}

const TONES = {
  success: { cls: "border-bid/30 bg-bid/[0.07] text-emerald-100", Icon: CheckCircle2 },
  warn: { cls: "border-amber-300/30 bg-amber-300/[0.07] text-amber-100", Icon: AlertTriangle },
  error: { cls: "border-ask/35 bg-ask/[0.08] text-rose-100", Icon: XCircle },
  info: { cls: "border-white/10 bg-white/[0.03] text-white/80", Icon: Info },
};
export function Notice({ tone = "info", title, children, action }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rise flex items-start gap-3 rounded-xl border p-3.5 text-[12px] leading-relaxed", cls)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{title && <p className="font-medium">{title}</p>}{children}</div>
      {action}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cx("shimmer rounded-lg", className)} />;

export function PageHead({ title, sub, aside }: { title: string; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] sm:text-[36px]">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-white/55">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}
