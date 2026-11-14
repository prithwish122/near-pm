import Reveal from "../Reveal";
import { IS_MAINNET } from "@/lib/config";

/** The original green band: dark at the top, glowing into the mint footer. */
export default function Closing() {
  return (
    <section className="news-bg relative mt-20 pb-24 pt-16 sm:mt-24 sm:pb-32 sm:pt-20">
      <Reveal className="wrap text-center">
        <span className="pill border-white/15 bg-white/[0.05] text-white/75">Roadmap</span>
        <h2 className="mx-auto mt-5 max-w-[760px] text-balance text-[30px] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[46px]">
          {IS_MAINNET ? <>What Ebbflow <span className="text-mint">ships next</span></> : <>Where Ebbflow <span className="text-mint">goes after testnet</span></>}
        </h2>
        <p className="mx-auto mt-4 max-w-[400px] text-[14px] text-white/70">A NEAR Intents solver, per-maker vault sub-accounts, an agent vault and an audited mainnet launch.</p>
      </Reveal>
    </section>
  );
}
