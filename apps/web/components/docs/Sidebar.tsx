"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, Search, X } from "lucide-react";
import { cx } from "@/components/app/ui";
import { DOCS, findPage } from "@/lib/docs/nav";

function Nav({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  const active = path === "/docs" ? "introduction" : path.split("/")[2];
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = DOCS.map((g) => ({
    ...g,
    pages: g.pages.filter((p) => !needle || p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)),
  })).filter((g) => g.pages.length);

  return (
    <div>
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter pages"
          aria-label="Filter documentation pages"
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-[13px] text-white placeholder:text-white/35 focus:border-emerald/40 focus:outline-none"
        />
      </label>
      <nav aria-label="Documentation" className="mt-5 space-y-6">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-2.5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-white/40">{g.title}</p>
            <ul className="mt-2 space-y-0.5">
              {g.pages.map((p) => {
                const on = p.slug === active;
                return (
                  <li key={p.slug}>
                    <Link
                      href={`/docs/${p.slug}`}
                      onClick={onPick}
                      aria-current={on ? "page" : undefined}
                      className={cx(
                        "relative flex min-h-9 items-center rounded-lg px-2.5 text-[13.5px] transition-colors",
                        on ? "bg-emerald/[0.09] font-medium text-white before:absolute before:left-0 before:top-2 before:h-5 before:w-[2px] before:rounded-full before:bg-emerald" : "text-white/60 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!groups.length && <p className="px-2.5 text-[13px] text-white/45">No pages match “{q}”.</p>}
      </nav>
    </div>
  );
}

/** Sticky sidebar on large screens; a collapsible bar with a drawer on small ones. */
export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const current = findPage(path === "/docs" ? "introduction" : path.split("/")[2] ?? "");
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto overscroll-contain py-8 pr-4 [scrollbar-width:thin]">
          <Nav />
        </div>
      </aside>

      <div className="sticky top-14 z-20 -mx-5 border-b border-white/[0.06] bg-[#07110a]/90 px-5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:hidden">
        <button onClick={() => setOpen(true)} className="flex h-12 w-full items-center gap-2 text-[13.5px] text-white/80" aria-expanded={open} aria-controls="docs-drawer">
          <BookOpen size={15} className="text-emerald" />
          <span className="truncate">{current?.title ?? "Docs"}</span>
          <ChevronDown size={15} className="ml-auto text-white/50" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" id="docs-drawer">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] overflow-y-auto border-r border-white/[0.08] bg-[#08130c] px-4 pb-10 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-medium">Documentation</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/[0.06]"><X size={18} /></button>
            </div>
            <Nav onPick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
