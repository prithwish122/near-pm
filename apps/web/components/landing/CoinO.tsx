/** The Ebbflow coin standing in for the "o" of "order": a dark green disc with a bright emerald rim,
 *  a sliver of metal edge on the right, and the mark in the middle. It turns very slightly at rest. */
export default function CoinO() {
  return (
    <span aria-hidden className="coin-o">
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id="coin-face" cx=".36" cy=".3" r=".8">
            <stop offset="0" stopColor="#3f7a5d" /><stop offset=".5" stopColor="#1d4232" /><stop offset="1" stopColor="#0e2219" />
          </radialGradient>
          <linearGradient id="coin-edge" x1="0" x2="1"><stop offset="0" stopColor="#2b3a33" /><stop offset=".55" stopColor="#8a9a93" /><stop offset="1" stopColor="#2a332f" /></linearGradient>
          <linearGradient id="coin-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5ff0ad" /><stop offset=".6" stopColor="#35dc90" /><stop offset="1" stopColor="#c9ffe4" /></linearGradient>
        </defs>
        {/* the metal edge, peeking out on the right */}
        <ellipse cx="55" cy="50" rx="46" ry="48" fill="url(#coin-edge)" />
        <circle cx="50" cy="50" r="46" fill="url(#coin-face)" />
        <circle cx="50" cy="50" r="43.5" fill="none" stroke="url(#coin-rim)" strokeWidth="4.5" />
        <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="1.5" />
        {/* the Ebbflow mark */}
        <g transform="translate(20 20) scale(2.5)" fill="none" stroke="#b6f5d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 9.5 12 5.5l7 4M5 14.5 12 18.5l7-4M8.5 12h7" />
        </g>
      </svg>
    </span>
  );
}
