"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin bar along the top that starts the moment an internal link is clicked and finishes when the
 * new page is in. Without it, a page that takes a moment to load (every page, the first time, in
 * development) looks like the click did nothing, and people click again.
 */
export default function NavProgress() {
  const path = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Capture phase: next/link calls preventDefault on its own click, so listen before it does.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.origin !== location.origin) return;
      if (a.pathname === location.pathname) return; // same page (including #anchors): nothing to load
      clearTimeout(timer.current);
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new page is in: finish the bar, then hide it.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    timer.current = setTimeout(() => setState("idle"), 400);
    return () => clearTimeout(timer.current);
  }, [path]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]">
      <div className={`h-full bg-gradient-to-r from-emerald to-mint shadow-[0_0_8px_rgba(53,220,144,.7)] ${
        state === "loading" ? "w-[85%] opacity-100 transition-[width] duration-[2500ms] ease-out"
        : state === "done" ? "w-full opacity-0 transition-[width,opacity] duration-300"
        : "w-0 opacity-0"}`} />
    </div>
  );
}
