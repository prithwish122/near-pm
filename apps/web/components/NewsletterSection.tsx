"use client";
import { useState } from "react";
import Reveal from "./Reveal";

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setState({ ok: false, text: "Please enter a valid email address." });
    setState({ ok: true, text: "Thanks! You're subscribed (demo — no email was sent)." });
    setEmail("");
  };
  return (
    <section className="news-bg relative pb-40 pt-16 sm:pb-52 sm:pt-20">
      <Reveal className="wrap text-center">
        <span className="pill border-white/15 bg-white/[0.05] text-white/75">Updates</span>
        <h2 className="mx-auto mt-5 max-w-[700px] text-[26px] font-normal leading-tight tracking-tight sm:text-[34px]">Be first when Ebbflow leaves testnet</h2>
        <p className="mx-auto mt-4 max-w-[380px] text-[12px] text-white/55">Roadmap: a NEAR Intents solver, per-maker vault sub-accounts, an agent vault and an audited mainnet launch.</p>
        <form onSubmit={submit} noValidate className="mx-auto mt-7 flex max-w-[440px] flex-col gap-2 sm:flex-row">
          <label htmlFor="nl" className="sr-only">Email address</label>
          <input id="nl" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setState(null); }} placeholder="Enter your email address" aria-invalid={state?.ok === false}
            className="h-10 flex-1 rounded-lg border border-white/15 bg-white/[0.07] px-3 text-xs text-white outline-none backdrop-blur placeholder:text-white/40 focus:border-mint" />
          <button className="h-10 rounded-lg bg-white px-5 text-xs font-medium text-dark transition hover:bg-mint2">Subscribe</button>
        </form>
        {state && <p role="status" className={`mt-3 text-xs ${state.ok ? "text-emerald-300" : "text-rose-200"}`}>{state.text}</p>}
      </Reveal>
    </section>
  );
}
