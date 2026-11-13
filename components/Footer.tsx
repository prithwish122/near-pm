import { Instagram, Twitter, Facebook, Linkedin, Github, Youtube } from "lucide-react";
import Logo from "./Logo";

const cols: [string, string[]][] = [
  ["Product", ["Trade", "Make", "Portfolio", "Activity", "Faucet"]],
  ["Developers", ["Contract spec", "Solver API", "MCP server", "Curve maths", "Test plan"]],
  ["Project", ["README", "Security model", "Known limitations", "Roadmap", "Demo video"]],
];
const socials = [[Instagram, "Instagram"], [Twitter, "Twitter"], [Facebook, "Facebook"], [Linkedin, "LinkedIn"], [Github, "GitHub"], [Youtube, "YouTube"]] as const;

export default function Footer() {
  return (
    <footer id="footer" className="bg-white text-dark">
      <div className="wrap pb-8 pt-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-[240px] text-[11px] leading-relaxed text-dark/60">Curve-shaped, self-refilling maker liquidity on NEAR, with atomic multi-maker fills and an agent-ready API. Built for NEAR Hackathon 2026.</p>
            <div className="mt-5 flex gap-2.5">
              {socials.map(([I, n]) => (
                <a key={n} href="#" aria-label={n} className="grid h-6 w-6 place-items-center rounded-md border border-dark/15 text-dark/70 transition hover:bg-dark hover:text-white"><I size={12} /></a>
              ))}
            </div>
          </div>
          {cols.map(([h, ls]) => (
            <nav key={h} aria-label={h}>
              <h4 className="text-[11px] font-semibold">{h}</h4>
              <ul className="mt-4 space-y-2.5 text-[11px] text-dark/60">
                {ls.map((l) => <li key={l}><a href="#" className="transition hover:text-dark">{l}</a></li>)}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-dark/10 pt-5 text-[10px] text-dark/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Ebbflow. Built at NEAR Hackathon 2026. Testnet only, not audited.</p>
          <p className="flex flex-wrap gap-x-6 gap-y-1"><span>hello@ebbflow.example</span><span>book.team.testnet</span></p>
        </div>
      </div>
    </footer>
  );
}
