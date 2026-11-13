import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export default function FeatureCard({ icon: Icon, title, text, href, highlight = false }: { icon: LucideIcon; title: string; text: string; href: string; highlight?: boolean }) {
  return (
    <Link href={href} className={`card-hover group relative block h-full overflow-hidden rounded-[20px] p-6 sm:p-7 ${highlight ? "border border-[#5aff72] bg-[#123a21]/80" : "glass"}`}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" aria-hidden preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M70 0 L100 55" stroke="rgba(255,255,255,.18)" strokeWidth=".3" fill="none" />
        <path d="M0 80 L40 100" stroke="rgba(255,255,255,.12)" strokeWidth=".3" fill="none" />
      </svg>
      <Icon size={30} strokeWidth={1.3} className="relative text-white/80 transition-transform duration-300 group-hover:scale-110" />
      <h3 className="relative mt-10 text-[22px] font-normal tracking-tight text-white/95 sm:mt-14">{title}</h3>
      <p className="relative mt-2 text-[11.5px] leading-relaxed text-white/55">{text}</p>
    </Link>
  );
}
