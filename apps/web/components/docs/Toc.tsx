"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/components/app/ui";

interface Item { id: string; text: string; level: number }

/** "On this page": built from the article's h2/h3 anchors, highlighting the section in view. */
export default function Toc() {
  const path = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const hs = Array.from(document.querySelectorAll<HTMLElement>("article [data-toc]"));
    setItems(hs.map((h) => ({ id: h.id, text: (h.textContent ?? "").replace(/#$/, "").trim(), level: Number(h.dataset.toc) })));
    setActive(hs[0]?.id ?? null);
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    hs.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [path]);

  if (!items.length) return null;
  return (
    <nav aria-label="On this page" className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 [scrollbar-width:thin]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-white/40">On this page</p>
      <ul className="mt-3 space-y-0.5 border-l border-white/[0.07]">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className={cx(
                "-ml-px block border-l py-1 text-[12.5px] leading-snug transition-colors",
                it.level === 3 ? "pl-6" : "pl-3",
                active === it.id ? "border-emerald text-white" : "border-transparent text-white/50 hover:text-white/85",
              )}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
