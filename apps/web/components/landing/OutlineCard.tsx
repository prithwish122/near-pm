"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Where the numeral's outline crosses the card's top edge: draws the glyph once on an offscreen canvas,
 * in the same font, size and position, and finds the outermost inked pixels on that row. The border is
 * then cut exactly there, so it runs right into the numeral's stroke.
 */
function edgeCrossing(t: SVGTextElement, w: number): [number, number] | null {
  const cs = getComputedStyle(t);
  const size = parseFloat(cs.fontSize);
  const x = parseFloat(t.getAttribute("x") ?? "0"), y = parseFloat(t.getAttribute("y") ?? "0");
  const pad = 4, top = Math.ceil(size); // room above the edge for the glyph
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w + pad * 2);
  cv.height = Math.ceil(top + y + pad);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = cs.letterSpacing;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = parseFloat(cs.strokeWidth) || 1.5;
  ctx.fillStyle = ctx.strokeStyle = "#000";
  ctx.fillText(t.textContent ?? "", x + pad, y + top);
  ctx.strokeText(t.textContent ?? "", x + pad, y + top);
  const row = ctx.getImageData(0, top + 1, cv.width, 1).data; // just inside the top edge
  let lo = -1, hi = -1;
  for (let i = 0; i < cv.width; i++) if (row[i * 4 + 3]! > 40) { if (lo < 0) lo = i; hi = i; }
  return lo < 0 ? null : [lo - pad, hi - pad + 1];
}

/**
 * A card whose outline and number are one drawing: the border runs round the card, breaks at the top
 * right where it meets the numeral, and the numeral is drawn in the very same line, so the number is
 * part of the card rather than placed on it. On hover the whole outline turns mint together.
 */
export default function OutlineCard({ n, children }: { n: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const num = useRef<SVGTextElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [gap, setGap] = useState<[number, number] | null>(null);

  // size the outline to the card, and find where the numeral crosses the top edge
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setSize({ w, h: el.clientHeight });
      const t = num.current;
      if (t) setGap(edgeCrossing(t, w) ?? (() => { const b = t.getBBox(); return [b.x, b.x + b.width] as [number, number]; })());
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure); // the numeral's width depends on the web font
    return () => ro.disconnect();
  }, []);

  const { w, h } = size, r = 24, S = 1.5;
  // the border, starting just right of the numeral and running clockwise back to its left side
  let border = "";
  if (w && h && gap) {
    const [g0, g1] = [Math.max(r, gap[0]), Math.min(w - r, gap[1])];
    const i = S / 2;
    border = [
      `M${g1},${i}`, `H${w - r}`, `A${r - i},${r - i} 0 0 1 ${w - i},${r}`,
      `V${h - r}`, `A${r - i},${r - i} 0 0 1 ${w - r},${h - i}`,
      `H${r}`, `A${r - i},${r - i} 0 0 1 ${i},${h - r}`,
      `V${r}`, `A${r - i},${r - i} 0 0 1 ${r},${i}`, `H${g0}`,
    ].join(" ");
  }

  return (
    <div ref={box} className="outline-card group relative h-full rounded-[24px] bg-[#030604]">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" width={w || undefined} height={h || undefined}>
        {border && <path d={border} fill="none" strokeWidth={S} className="outline-line" />}
        {/* baseline sits below the top edge so the numeral straddles it */}
        <text ref={num} x={Math.max(0, w - 22)} y={58} textAnchor="end" strokeWidth={S} className="outline-line outline-num">{n}</text>
      </svg>
      <div className="relative flex h-full flex-col p-6 pt-8 sm:p-7 sm:pt-9">{children}</div>
    </div>
  );
}
