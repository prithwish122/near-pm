"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs `fn` now and every `ms` while the tab is visible. Re-runs when `deps` change.
 * `initial`, when given (a snapshot sent with the page), is shown straight away and polling refreshes it.
 */
export function usePolling<T>(fn: () => Promise<T>, deps: unknown[], ms = 5000, initial?: T | null) {
  const [data, setData] = useState<T | null>(initial ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(initial == null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const seeded = useRef(initial != null); // true only until the first run, when a snapshot was given

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    try {
      const v = await fnRef.current();
      if (id === seq.current) { setData(v); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // with a snapshot, the first run refreshes quietly; any later change of inputs shows loading as before
    if (!seeded.current) setLoading(true);
    seeded.current = false;
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, ms);
    const onTx = () => { void refresh(); setTimeout(() => void refresh(), 4000); };
    window.addEventListener("ebbflow:tx", onTx);
    return () => { clearInterval(t); window.removeEventListener("ebbflow:tx", onTx); seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, ms]);

  return { data, error, loading, refresh };
}
