// Dot-matrix world map generated from coarse continent polygons (decorative, not geographic).
const POLYS: number[][][] = [
  [[5,8],[25,5],[32,10],[30,20],[24,27],[18,24],[10,16]],
  [[22,29],[32,30],[36,38],[30,48],[25,42]],
  [[44,10],[56,8],[58,16],[50,20],[44,18]],
  [[44,22],[56,22],[60,32],[54,42],[47,38],[43,28]],
  [[58,8],[90,8],[92,20],[82,28],[70,28],[60,20]],
  [[78,36],[92,36],[92,44],[80,44]],
];
function inside(x: number, y: number, p: number[][]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const dots: [number, number][] = [];
for (let x = 1; x < 100; x += 1.5) for (let y = 2; y < 50; y += 1.5) if (POLYS.some((p) => inside(x, y, p))) dots.push([x, y]);
const markers: [number, number][] = [[17, 16], [50, 14], [52, 30], [76, 18], [86, 40], [29, 36]];
const arcs = [[17,16,50,14],[50,14,76,18],[17,16,29,36],[76,18,86,40],[52,30,86,40]];

export default function WorldMap() {
  return (
    <svg viewBox="0 0 100 50" className="h-full w-full" role="img" aria-label="Map showing global availability">
      {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".33" fill="#73c892" opacity=".55" />)}
      {arcs.map(([x1, y1, x2, y2], i) => (
        <path key={i} d={`M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 9} ${x2} ${y2}`} fill="none" stroke="#86ffb8" strokeWidth=".25" opacity=".6" strokeDasharray=".8 .8" />
      ))}
      {markers.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="1" fill="#86ffb8" className="ping-slow" />
          <circle cx={x} cy={y} r=".9" fill="#d0ffe5" />
        </g>
      ))}
    </svg>
  );
}
