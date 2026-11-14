import Link from "next/link";
import { Github } from "lucide-react";
import { BOOK, HAS_FAUCET, NETWORK_NOTE, accountUrl } from "@/lib/config";
import Logo from "./Logo";

const REPO = "https://github.com/prithwish122/near-pm";
const cols: [string, [string, string][]][] = [
  ["Product", [["Trade", "/trade"], ["Make", "/make"], ["Portfolio", "/portfolio"], ["Activity", "/activity"], ...(HAS_FAUCET ? [["Faucet", "/faucet"] as [string, string]] : [])]],
  ["Developers", [["Documentation", "/docs"], ["Contract API", "/docs/contract"], ["Solver API", "/docs/solver-api"], ["MCP server", "/docs/mcp"], ["Curve maths", "/docs/curve-model"]]],
  ["Project", [["README and PRD", `${REPO}/blob/main/PRD.md`], ["Atomic fills", "/articles/atomic-fills-on-near"], ["Agents over MCP", "/articles/trading-with-agents-over-mcp"], ["Source code", REPO]]],
];

/** The original mint footer, picking up where the green closing band ends. */
export default function Footer() {
  return (
    <footer id="footer" className="relative overflow-hidden bg-[#c4e6d3] text-dark">
      <div className="wrap pb-6 pt-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-[260px] text-[13px] leading-relaxed text-dark/80">Curve-shaped, self-refilling maker liquidity on NEAR, with atomic multi-maker fills and an agent-ready API.</p>
            <a href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub repository" className="mt-4 grid h-11 w-11 place-items-center rounded-full border border-dark/20 text-dark/80 transition hover:bg-dark hover:text-white"><Github size={14} /></a>
          </div>
          {cols.map(([h, ls]) => (
            <nav key={h} aria-label={h}>
              <h4 className="text-[12px] font-semibold">{h}</h4>
              <ul className="mt-2 text-[13px] text-dark/80 sm:mt-3">
                {ls.map(([l, href]) => <li key={l}>{href.startsWith("http") ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center transition hover:text-dark sm:min-h-8">{l}</a> : <Link href={href} className="inline-flex min-h-11 items-center transition hover:text-dark sm:min-h-8">{l}</Link>}</li>)}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-dark/10 pt-5 text-[12px] text-dark/80 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Ebbflow. Built at NEAR Hackathon 2026. {NETWORK_NOTE[0]!.toUpperCase() + NETWORK_NOTE.slice(1)}.</p>
          <p>Book contract: <a href={accountUrl(BOOK)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-dark">{BOOK}</a></p>
        </div>
      </div>
      <p aria-hidden className="pointer-events-none -mb-[1.6vw] select-none text-center text-[13vw] font-medium leading-[0.8] tracking-[-0.07em] text-dark/[0.06]">ebbflow</p>
    </footer>
  );
}
