import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { articles } from "@/lib/articles";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DocArt, { minutes } from "@/components/DocArt";
import type { ReactNode } from "react";

export function generateStaticParams() { return articles.map((a) => ({ slug: a.slug })); }

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = articles.find((x) => x.slug === params.slug);
  return a ? { title: `${a.title} · Ebbflow docs`, description: a.text } : {};
}

/** Where in the app each article's idea can be tried. */
const TRY: Record<string, { label: string; href: string; note: string }> = {
  "curve-maths-explained": { label: "Shape a curve", href: "/make", note: "Pick a range and a shape and watch the price move along it." },
  "atomic-fills-on-near": { label: "Try a swap", href: "/trade", note: "Quote a trade and see every leg it would settle in one receipt." },
  "trading-with-agents-over-mcp": { label: "See the MCP server", href: "https://github.com/prithwish122/near-pm/tree/main/services/mcp", note: "The tools, their caps, and how to point an agent at them." },
};

/** Set contract and tool names (snake_case, ft_* calls, U256) as inline code so they read as names. */
function withCode(text: string): ReactNode[] {
  return text.split(/(\b[a-z]+(?:_[a-z]+)+\b|\bU256\b)/g).map((part, i) =>
    i % 2 ? <code key={i} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.86em] text-mint">{part}</code> : part,
  );
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const a = articles.find((x) => x.slug === params.slug);
  if (!a) notFound();
  const others = articles.filter((x) => x.slug !== a.slug);
  const tryIt = TRY[a.slug];
  const ext = tryIt?.href.startsWith("http");

  return (
    <main className="landing">
      <Navbar />
      {/* header: the original green glow, softer than the hero */}
      <header className="relative overflow-hidden pt-28 sm:pt-32" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(30,190,110,.28), transparent 70%)" }}>
        <div className="wrap">
          <Link href="/#docs" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] text-mint hover:text-mint2"><ArrowLeft size={14} />All docs</Link>
          <div className="mt-4 grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <span className="pill border-white/15 bg-white/[0.05] text-white/80">Docs · {minutes(a.body)} min read</span>
              <h1 className="mt-5 text-balance text-[38px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[56px]">{a.title}</h1>
              <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-white/75">{a.text}</p>
            </div>
            <div className="panel-acc rounded-[20px] p-5 lg:col-span-5">
              <div className="rounded-xl border border-white/10 bg-black/25 p-4"><DocArt slug={a.slug} big /></div>
            </div>
          </div>
        </div>
      </header>

      <div className="wrap mt-14 grid gap-12 pb-20 sm:mt-16 lg:grid-cols-12">
        <article className="space-y-6 text-[16px] leading-[1.8] text-white/75 lg:col-span-7">
          {a.body.map((p, i) => (
            <p key={i} className={i === 0 ? "text-[17.5px] text-white/85" : undefined}>{withCode(p)}</p>
          ))}
        </article>

        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="space-y-3 lg:sticky lg:top-24">
            {tryIt && (
              <div className="panel-acc rounded-[20px] p-5">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-white/60">Try it</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/75">{tryIt.note}</p>
                <Link href={tryIt.href} target={ext ? "_blank" : undefined} rel={ext ? "noreferrer" : undefined}
                  className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-semibold text-ink transition-colors hover:bg-mint">
                  {tryIt.label}{ext ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}
                </Link>
              </div>
            )}
            <div className="panel-acc rounded-[20px] p-5">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-white/60">Keep reading</p>
              <ul className="mt-2">
                {others.map((o) => (
                  <li key={o.slug} className="border-t border-white/[0.08] first:border-t-0">
                    <Link href={`/articles/${o.slug}`} className="group flex min-h-11 items-center justify-between gap-3 py-3 text-[14px] text-white/85 hover:text-white">
                      {o.title}<ArrowRight size={14} className="shrink-0 text-mint transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
      <Footer />
    </main>
  );
}
