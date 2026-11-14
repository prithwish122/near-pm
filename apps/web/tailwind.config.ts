import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07110a", ink2: "#0d2015", deep: "#134b2f", emerald: "#35dc90",
        accent: "#a3e8c0", mint: "#a2ffd0", mint2: "#e2fff0", muted: "#a5bcb0", dark: "#13231b",
        bid: "#5ccf94", ask: "#e8687e", panel: "#111113", panel2: "#18181b", desk: "#0a0a0b", line: "rgba(255,255,255,0.07)",
      },
      fontFamily: { sans: ["Funnel Sans", "system-ui", "sans-serif"], display: ["Funnel Display", "Funnel Sans", "system-ui", "sans-serif"], mono: ["var(--font-mono)", "ui-monospace", "monospace"] },
      maxWidth: { wrap: "1240px" },
    },
  },
  plugins: [],
};
export default config;
