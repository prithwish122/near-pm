import ArticleCard from "./ArticleCard";
import Reveal from "./Reveal";
import { StudyArt, StopOrderArt, StakingArt } from "./Illustrations";
import { articles } from "@/lib/articles";

const arts = [<StudyArt key="1" />, <StopOrderArt key="2" />, <StakingArt key="3" />];

export default function ArticleSection() {
  return (
    <section id="articles" className="wrap pb-6 pt-14 sm:pt-20">
      <Reveal>
        <span className="pill border-white/15 bg-white/[0.04] text-white/70">Docs</span>
        <h2 className="mt-5 text-[28px] font-normal tracking-tight sm:text-[34px]">How Ebbflow works</h2>
        <p className="mt-3 max-w-[420px] text-[12px] leading-relaxed text-white/50">The maths, the settlement model and the agent tooling, explained for makers, takers and judges.</p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {articles.map((a, i) => (
          <Reveal key={a.slug} delay={i * 0.07}><ArticleCard slug={a.slug} title={a.title} text={a.text} art={arts[i]} /></Reveal>
        ))}
      </div>
    </section>
  );
}
