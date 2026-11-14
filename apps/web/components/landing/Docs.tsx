import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Reveal from "../Reveal";
import DocArt, { minutes } from "../DocArt";
import { articles } from "@/lib/articles";
import { SectionHead } from "./ui";

/** The docs as three cards, each with a picture of what the article covers. */
export default function Docs() {
  return (
    <section id="docs" className="wrap scroll-mt-14 pt-16 sm:pt-20">
      <Reveal><SectionHead tag="Docs" title="The details, explained" intro="The maths, the settlement model and the agent tooling, explained for makers, takers and judges." /></Reveal>
      <div className="mt-10 grid gap-3 sm:mt-12 md:grid-cols-3">
        {articles.map((a, i) => (
          <Reveal key={a.slug} delay={i * 0.06} className="h-full">
            {/* light mint "paper" cards with a dark inset picture: a third surface, after the black panel and the glass cards */}
            <Link href={`/articles/${a.slug}`} className="group relative flex h-full flex-col overflow-hidden rounded-[20px] bg-[#c4e6d3] p-4 text-dark shadow-[0_24px_60px_-34px_rgba(0,0,0,.9)] transition-[background-color,transform] duration-500 hover:-translate-y-1 hover:bg-[#d2eedf] sm:p-5">
              <div className="relative flex h-[190px] items-center overflow-hidden rounded-[14px] bg-[#0a1a12] p-3.5 text-white"><DocArt slug={a.slug} /></div>
              <p className="relative mt-5 px-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-dark/70">Docs · {minutes(a.body)} min read</p>
              <h3 className="relative mt-2 px-1 text-[20px] font-medium leading-snug tracking-[-0.015em] text-dark">{a.title}</h3>
              <p className="relative mt-2 px-1 text-[14px] leading-relaxed text-dark/75">{a.text}</p>
              <span className="relative mt-auto inline-flex items-center gap-1.5 px-1 pt-5 text-[13px] font-semibold text-dark">
                Read<ArrowUpRight size={15} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-6 flex justify-center">
        <Link href="/docs" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[13px] font-medium text-white/85 transition-colors hover:border-emerald/40 hover:text-white">
          Read the full documentation<ArrowRight size={14} />
        </Link>
      </Reveal>
    </section>
  );
}
