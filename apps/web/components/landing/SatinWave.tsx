"use client";
import { useEffect, useRef } from "react";
import { depthProfile, useLive } from "./live";

/* A liquid, satin-like surface: dense contour lines lit by a moving highlight, so it reads as a
 * sheet of glossy material rather than a chart. Its main swell is the live book's depth (bids rising
 * on the left, asks on the right, the spread at the centre), so the surface is real data. */
const S = 120;
const FALLBACK = Array.from({ length: S + 1 }, (_, k) => { const u = Math.abs(k / S - 0.5) * 2; return u < 0.08 ? 0 : 0.7 * Math.pow((u - 0.08) / 0.92, 1.2); });

export default function SatinWave({ className, tone = "light", lines = 64, amp = 1 }: { className?: string; tone?: "light" | "green"; lines?: number; amp?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { curves } = useLive();
  const target = useRef<number[]>(FALLBACK);
  useEffect(() => { const p = depthProfile(curves?.depth, S); if (p?.some((v) => v > 0)) target.current = p; }, [curves]);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shape = [...FALLBACK];
    let raf = 0, last = 0, visible = true, timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
    io.observe(cv);
    const GS = 18; // gradient stops per line

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dt = last ? now - last : 16; last = now;
      const dpr = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ease = still ? 1 : 1 - Math.exp(-dt / 1400);
      for (let k = 0; k <= S; k++) shape[k]! += (target.current[k]! - shape[k]!) * ease;
      const s = still ? 3 : now / 1000;

      const height = (u: number, z: number) => {
        const b = shape[Math.min(S, Math.max(0, Math.round(u * S)))]!;
        return b * (0.55 + 0.45 * z) * amp
          + 0.22 * Math.sin(u * 5.2 + s * 0.35 + z * 2.2)
          + 0.1 * Math.sin(u * 11 - s * 0.55 + z * 4.5)
          + 0.06 * Math.sin(z * 9 + s * 0.6);
      };
      const light = 0.5 + 0.35 * Math.sin(s * 0.25); // the highlight drifts slowly across the sheet

      for (let i = 0; i < lines; i++) {
        const z = i / (lines - 1);                     // 0 far .. 1 near
        const persp = 0.45 + 0.55 * z;
        const base = h * (0.18 + 0.72 * Math.pow(z, 1.25));
        const xAt = (u: number) => w / 2 + (u - 0.5) * w * 1.35 * persp;
        const yAt = (u: number) => base - height(u, z) * h * 0.36 * persp;

        // Light each line by its slope: facing the light -> bright, facing away -> dark. That is the satin.
        const g = ctx.createLinearGradient(xAt(0), 0, xAt(1), 0);
        for (let j = 0; j <= GS; j++) {
          const u = j / GS, du = 0.012;
          const slope = (height(u + du, z) - height(u - du, z)) / (2 * du);
          const spec = Math.pow(Math.max(0, 1 - Math.abs(slope * 0.9 - (light - 0.5) * 2.2 + 0.35)), 6);
          const fade = Math.min(1, Math.min(u, 1 - u) * 5);
          // Shadowed faces go deep green, lit faces go white: two tones give the sheet its depth.
          const a = (0.16 + 0.3 * z + spec * (0.45 + 0.35 * z)) * fade;
          const [r0, g0, b0] = tone === "light" ? [8, 52, 30] : [10, 60, 36];
          const [r1, g1, b1] = tone === "light" ? [244, 255, 249] : [226, 255, 240];
          const m = Math.min(1, spec * 1.3);
          g.addColorStop(u, `rgba(${Math.round(r0 + (r1 - r0) * m)},${Math.round(g0 + (g1 - g0) * m)},${Math.round(b0 + (b1 - b0) * m)},${a.toFixed(3)})`);
        }
        ctx.beginPath();
        for (let k = 0; k <= 90; k++) { const u = k / 90; k ? ctx.lineTo(xAt(u), yAt(u)) : ctx.moveTo(xAt(u), yAt(u)); }
        ctx.strokeStyle = g;
        ctx.lineWidth = 0.6 + 1.1 * z;
        ctx.stroke();
      }
      if (still) { cancelAnimationFrame(raf); timer = setTimeout(() => { raf = requestAnimationFrame(draw); }, 30000); }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); io.disconnect(); };
  }, [tone, lines, amp]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
