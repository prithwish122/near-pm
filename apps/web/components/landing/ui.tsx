import type { ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** Section label. The same rounded pill as the hero's, so the page has one labelling style. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("pill w-fit self-start border-white/15 bg-white/[0.05] text-white/80", className)}>{children}</span>;
}

/** A section's opening: label, heading and intro stacked on the left. */
export function SectionHead({ tag, title, intro }: { tag: string; title: ReactNode; intro?: string }) {
  return (
    <div className="max-w-[720px]">
      <Tag>{tag}</Tag>
      <h2 className="mt-5 text-balance text-[34px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[46px]">{title}</h2>
      {intro && <p className="mt-4 max-w-[460px] text-[14px] leading-relaxed text-white/60">{intro}</p>}
    </div>
  );
}
