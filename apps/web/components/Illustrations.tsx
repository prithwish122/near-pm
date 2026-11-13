// Cohesive flat/vector illustrations in accent, white and yellow accents.
const skin = "#f2c4a8", hair = "#1a5e3b", yellow = "#ffc83d";

function Person({ x, y, shirt = "#ff8a3d", scale = 1 }: { x: number; y: number; shirt?: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-9" y="22" width="18" height="30" rx="8" fill={shirt} />
      <rect x="-8" y="52" width="6" height="22" rx="3" fill="#1a5e3b" />
      <rect x="2" y="52" width="6" height="22" rx="3" fill="#1a5e3b" />
      <circle cx="0" cy="12" r="10" fill={skin} />
      <path d="M-10 10a10 10 0 0 1 20 0c-4-4-14-4-20 0Z" fill={hair} />
    </g>
  );
}
const Coin = ({ x, y, r = 12 }: { x: number; y: number; r?: number }) => (
  <g><circle cx={x} cy={y} r={r} fill={yellow} /><circle cx={x} cy={y} r={r - 3} fill="none" stroke="#e29a00" strokeWidth="1.5" /><text x={x} y={y + r / 3} textAnchor="middle" fontSize={r} fontWeight="700" fill="#b87400">$</text></g>
);

export function StudyArt() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect x="30" y="14" width="110" height="74" rx="8" fill="#fff" />
      <rect x="30" y="14" width="110" height="12" rx="8" fill="#e0fff0" />
      <rect x="40" y="56" width="10" height="24" rx="2" fill="#55ffb0" /><rect x="56" y="46" width="10" height="34" rx="2" fill="#35dc90" />
      <rect x="72" y="38" width="10" height="42" rx="2" fill="#a2ffd0" />
      <path d="M92 66l14-14 12 8 14-20" stroke="#ff8a3d" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="120" cy="38" r="12" fill="#e0fff0" stroke="#35dc90" strokeWidth="2" /><path d="M120 38V32M120 38h5" stroke="#35dc90" strokeWidth="2" strokeLinecap="round" />
      <Person x={160} y={36} />
      <path d="M150 70l-12-14" stroke={skin} strokeWidth="6" strokeLinecap="round" />
      <rect x="20" y="100" width="170" height="4" rx="2" fill="#2a8a52" />
    </svg>
  );
}
export function StopOrderArt() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M28 98 70 70l30 14 54-52" stroke="#55ffb0" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 28h22v22" stroke="#55ffb0" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Coin x={150} y={26} r={14} />
      <Person x={80} y={26} shirt="#35dc90" scale={0.95} />
      <rect x="40" y="100" width="130" height="5" rx="2.5" fill="#2a8a52" />
      <path d="M170 74l8 8-8 8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}
export function StakingArt() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M60 30a40 40 0 0 1 40 40v10h-22V70a18 18 0 0 0-18-18Z" fill="#e0fff0" transform="rotate(0)" />
      <path d="M40 60a40 40 0 0 1 80 0v24H98V60a18 18 0 0 0-36 0v24H40Z" fill="#35dc90" />
      <rect x="40" y="76" width="22" height="10" fill="#e0fff0" /><rect x="98" y="76" width="22" height="10" fill="#ff5a7a" />
      <Coin x={150} y={44} r={14} /><Coin x={168} y={72} r={10} /><Coin x={134} y={82} r={8} />
      <Person x={30} y={26} shirt="#fff" scale={0.8} />
      <rect x="20" y="102" width="165" height="4" rx="2" fill="#2a8a52" />
    </svg>
  );
}
