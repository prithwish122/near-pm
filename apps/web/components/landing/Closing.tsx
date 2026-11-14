"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Reveal from "../Reveal";
import { IS_MAINNET } from "@/lib/config";

/** The original green band: dark at the top, glowing into the mint footer. */
export default function Closing() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setState({ ok: false, text: "Please enter a valid email address." });
    setState({ ok: true, text: "Thanks! You're on the list (demo, no email was sent)." });
    setEmail("");
  };
  return (
    <section className="news-bg relative mt-20 pb-24 pt-16 sm:mt-24 sm:pb-32 sm:pt-20">
      <Reveal className="wrap text-center">
        <span className="pill border-white/15 bg-white/[0.05] text-white/75">Roadmap</span>
        <h2 className="mx-auto mt-5 max-w-[760px] text-balance text-[30px] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[46px]">
          {IS_MAINNET ? <>Be first to hear <span className="text-mint">what ships next</span></> : <>Be first when Ebbflow <span className="text-mint">leaves testnet</span></>}
        </h2>
        <p className="mx-auto mt-4 max-w-[400px] text-[14px] text-white/70">A NEAR Intents solver, per-maker vault sub-accounts, an agent vault and an audited mainnet launch.</p>
        <form onSubmit={submit} noValidate className="mx-auto mt-8 flex max-w-[440px] items-center gap-2 rounded-full border border-white/15 bg-black/25 p-1.5 pl-5 backdrop-blur transition-colors focus-within:border-mint/60">
          <label htmlFor="nl" className="sr-only">Email address</label>
          <input id="nl" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setState(null); }} placeholder="you@domain.com" aria-invalid={state?.ok === false}
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35" />
          <button className="group inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-5 text-[13px] font-medium text-dark transition-colors hover:bg-mint2">
            Subscribe<ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>
        <p role="status" className={`mt-3 min-h-[18px] text-[12px] ${state?.ok ? "text-mint2" : "text-rose-200"}`}>{state?.text}</p>
      </Reveal>
    </section>
  );
}
