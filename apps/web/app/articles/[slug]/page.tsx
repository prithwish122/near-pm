import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/lib/articles";

export function generateStaticParams() { return articles.map((a) => ({ slug: a.slug })); }

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const a = articles.find((x) => x.slug === params.slug);
  if (!a) notFound();
  return (
    <main className="wrap min-h-screen py-24">
      <Link href="/#articles" className="text-xs text-mint hover:underline">← Back to docs</Link>
      <h1 className="mt-6 max-w-2xl text-4xl font-normal tracking-tight">{a.title}</h1>
      <div className="mt-8 max-w-xl space-y-5 text-sm leading-relaxed text-white/65">
        {a.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </main>
  );
}
