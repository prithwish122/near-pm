"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Code with a language label and a copy button. */
export default function CodeBlock({ code, lang = "bash", title }: { code: string; lang?: string; title?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#060c08]">
      <div className="flex h-9 items-center justify-between border-b border-white/[0.06] pl-4 pr-1.5">
        <span className="font-mono text-[11px] text-white/45">{title ?? lang}</span>
        <button onClick={copy} aria-label="Copy code" className="grid h-7 w-7 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white">
          {done ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.75] text-white/85"><code>{code}</code></pre>
    </div>
  );
}
