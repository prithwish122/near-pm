// Text wordmarks only (no trademarked logo artwork).
const marks = [
  <span key="near" className="flex items-center gap-1.5 text-[18px] font-semibold tracking-tight"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M5 21V3l14 18V3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" /></svg>NEAR</span>,
  <span key="intents" className="text-[17px] font-semibold tracking-tight">NEAR <span className="font-normal">Intents</span></span>,
  <span key="rust" className="flex items-center gap-1.5 text-[18px] font-bold tracking-tight"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" strokeLinecap="round" /></svg>Rust</span>,
  <span key="ts" className="flex items-center gap-1.5 text-[17px] font-semibold"><span className="grid h-[18px] w-[18px] place-items-center rounded-[3px] bg-dark text-[9px] font-bold text-white">TS</span>TypeScript</span>,
  <span key="react" className="text-[17px] font-semibold tracking-tight">React</span>,
  <span key="mcp" className="text-[17px] font-bold tracking-wide">MCP</span>,
  <span key="claude" className="flex items-center gap-1.5 text-[18px] font-semibold tracking-tight"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" /></svg>Claude</span>,
];

export default function BrandStrip() {
  return (
    <div className="wrap pb-9 pt-2">
      <p className="mb-5 text-center text-[10px] uppercase tracking-[0.2em] text-dark/50">Built with</p>
      <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-dark lg:justify-between" aria-label="Built with">
        {marks.map((m, i) => <li key={i} className="whitespace-nowrap opacity-90">{m}</li>)}
      </ul>
    </div>
  );
}
