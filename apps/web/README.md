# Ebbflow landing page

Landing page for **Ebbflow**, curve-shaped, self-refilling maker liquidity on NEAR (NEAR Hackathon 2026).

Next.js 14 · TypeScript · Tailwind · Framer Motion · Lucide.

```bash
npm install
npm run dev     # http://localhost:3100
npm run build
```

The hero swap widget is a **demo**: it uses a floating-point port of the curve maths (`lib/curve.ts`) against a fixed book. It does not connect to a wallet or chain.
