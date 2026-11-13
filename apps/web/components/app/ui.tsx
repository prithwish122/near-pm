"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className, title, aside }: { children: ReactNode; className?: string; title?: ReactNode; aside?: ReactNode }) {
  return (
    <section className={cx("glass rounded-[20px] p-5 sm:p-6", className)}>
      {(title || aside) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-medium text-white/90">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger";
export function Btn({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = {
    primary: "bg-white text-dark hover:bg-mint2",
    ghost: "border border-white/15 bg-white/[0.04] text-white hover:bg-white/10",
    danger: "border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  }[variant];
  return <button {...p} className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40", v, className)} />;
}

export function Field({ label, suffix, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; suffix?: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = p.id ?? `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[11px] text-white/70">{label}</label>
      <div className={cx("mt-1.5 flex items-center gap-2 rounded-xl border bg-[#0f2a1c]/70 px-3 py-2", error ? "border-rose-400/60" : "border-white/[0.07] focus-within:border-mint/60")}>
        <input id={id} inputMode="decimal" autoComplete="off" {...p} className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-white/30 disabled:opacity-40" />
        {suffix && <span className="shrink-0 text-xs text-white/60">{suffix}</span>}
      </div>
      {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : hint ? <p className="mt-1 text-[11px] text-white/45">{hint}</p> : null}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-white/[0.07] p-0.5 text-[12px]">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-md px-3 py-1.5 transition", value === o.value ? "bg-white text-dark" : "text-white/70 hover:text-white")}>{o.label}</button>
      ))}
    </div>
  );
}

const TONES = {
  success: { cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100", Icon: CheckCircle2 },
  warn: { cls: "border-amber-300/40 bg-amber-300/10 text-amber-100", Icon: AlertTriangle },
  error: { cls: "border-rose-400/40 bg-rose-500/10 text-rose-100", Icon: XCircle },
  info: { cls: "border-white/15 bg-white/[0.05] text-white/80", Icon: Info },
};
export function Notice({ tone = "info", title, children, action }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-xl border p-3.5 text-[12px] leading-relaxed", cls)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{title && <p className="font-medium">{title}</p>}{children}</div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-[20px] font-medium tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/45">{sub}</p>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cx("animate-pulse rounded-lg bg-white/[0.07]", className)} />;

export function PageHead({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-normal tracking-tight sm:text-[34px]">{title}</h1>
      {sub && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/55">{sub}</p>}
    </div>
  );
}
