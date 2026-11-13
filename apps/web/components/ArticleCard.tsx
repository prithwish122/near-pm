import Link from "next/link";
import type { ReactNode } from "react";

export default function ArticleCard({ slug, title, text, art }: { slug: string; title: ReactNode; text: string; art: ReactNode }) {
  return (
    <Link href={`/articles/${slug}`} className="card-hover glass group flex h-full flex-col rounded-[20px] p-5">
      <div className="h-[130px] overflow-hidden rounded-xl bg-gradient-to-b from-[#1a6e40]/40 to-transparent transition-transform duration-500 group-hover:scale-[1.03]">{art}</div>
      <h3 className="mt-5 text-[16px] font-medium leading-snug text-white/95">{title}</h3>
      <p className="mt-2 text-[11px] leading-relaxed text-white/45">{text}</p>
    </Link>
  );
}
