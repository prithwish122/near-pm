import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Github } from "lucide-react";
import Toc from "@/components/docs/Toc";
import { CONTENT } from "@/components/docs/content";
import { ALL_PAGES, findPage, groupOf } from "@/lib/docs/nav";

const REPO = "https://github.com/prithwish122/near-pm";

export function generateStaticParams() {
  return ALL_PAGES.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const p = findPage(params.slug);
  return p ? { title: `${p.title} · Docs`, description: p.description } : {};
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const page = findPage(params.slug);
  const Body = CONTENT[params.slug];
  if (!page || !Body) notFound();
  const i = ALL_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = ALL_PAGES[i - 1];
  const next = ALL_PAGES[i + 1];

  return (
    <div className="min-w-0 xl:grid xl:grid-cols-[minmax(0,1fr)_200px] xl:gap-10">
      <div className="min-w-0 pb-20 pt-8 lg:pt-10">
        <header className="max-w-[760px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.09em] text-emerald/80">{groupOf(page.slug)?.title}</p>
          <h1 className="mt-3 text-balance text-[34px] font-normal leading-[1.1] tracking-[-0.03em] text-white sm:text-[42px]">{page.title}</h1>
          <p className="mt-4 text-[16.5px] leading-relaxed text-white/65">{page.description}</p>
        </header>

        <article className="mt-10 max-w-[760px]">
          <Body />
        </article>

        <div className="mt-16 max-w-[760px] border-t border-white/[0.07] pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="group rounded-xl border border-white/[0.08] px-4 py-3.5 transition-colors hover:border-emerald/30 hover:bg-white/[0.02]">
                <span className="flex items-center gap-1.5 text-[12px] text-white/45"><ArrowLeft size={13} />Previous</span>
                <span className="mt-1 block text-[14.5px] text-white group-hover:text-mint">{prev.title}</span>
              </Link>
            ) : <span />}
            {next && (
              <Link href={`/docs/${next.slug}`} className="group rounded-xl border border-white/[0.08] px-4 py-3.5 text-right transition-colors hover:border-emerald/30 hover:bg-white/[0.02]">
                <span className="flex items-center justify-end gap-1.5 text-[12px] text-white/45">Next<ArrowRight size={13} /></span>
                <span className="mt-1 block text-[14.5px] text-white group-hover:text-mint">{next.title}</span>
              </Link>
            )}
          </div>
          <a href={`${REPO}/tree/main/apps/web/components/docs/content`} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white/80">
            <Github size={13} />Edit this page on GitHub
          </a>
        </div>
      </div>
      <aside className="hidden xl:block"><Toc /></aside>
    </div>
  );
}
