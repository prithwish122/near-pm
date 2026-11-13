import Link from "next/link";
import { Github } from "lucide-react";
import { BOOK, accountUrl } from "@/lib/config";
import Logo from "./Logo";

const REPO = "https://github.com/prithwish122/near-pm";
const cols: [string, [string, string][]][] = [
  ["Product", [["Trade", "/trade"], ["Make", "/make"], ["Portfolio", "/portfolio"], ["Activity", "/activity"], ["Faucet", "/faucet"]]],
  ["Developers", [["Contract", `${REPO}/tree/main/contracts/ebbflow`], ["Solver API", `${REPO}/tree/main/services/solver`], ["MCP server", `${REPO}/tree/main/services/mcp`], ["Curve maths", "/articles/curve-maths-explained"], ["Integration tests", `${REPO}/tree/main/tests/integration`]]],
  ["Project", [["README and PRD", `${REPO}/blob/main/PRD.md`], ["Atomic fills", "/articles/atomic-fills-on-near"], ["Agents over MCP", "/articles/trading-with-agents-over-mcp"], ["Source code", REPO]]],
];

export default function Footer() {
  return (
    <footer id="footer" className="bg-white text-dark">
      <div className="wrap pb-8 pt-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-[240px] text-[11px] leading-relaxed text-dark/60">Curve-shaped, self-refilling maker liquidity on NEAR, with atomic multi-maker fills and an agent-ready API. Built for NEAR Hackathon 2026.</p>
            <div className="mt-5 flex gap-2.5">
              <a href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub repository" className="grid h-6 w-6 place-items-center rounded-md border border-dark/15 text-dark/70 transition hover:bg-dark hover:text-white"><Github size={12} /></a>
            </div>
          </div>
          {cols.map(([h, ls]) => (
            <nav key={h} aria-label={h}>
              <h4 className="text-[11px] font-semibold">{h}</h4>
              <ul className="mt-4 space-y-2.5 text-[11px] text-dark/60">
                {ls.map(([l, h]) => <li key={l}>{h.startsWith("http") ? <a href={h} target="_blank" rel="noreferrer" className="transition hover:text-dark">{l}</a> : <Link href={h} className="transition hover:text-dark">{l}</Link>}</li>)}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-dark/10 pt-5 text-[10px] text-dark/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Ebbflow. Built at NEAR Hackathon 2026. Testnet only, not audited.</p>
          <p>Book contract: <a href={accountUrl(BOOK)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-dark">{BOOK}</a></p>
        </div>
      </div>
    </footer>
  );
}
