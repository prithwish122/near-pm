import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07110a", ink2: "#0d2015", deep: "#134b2f", emerald: "#35dc90",
        accent: "#55ffb0", mint: "#a2ffd0", mint2: "#e2fff0", muted: "#a5bcb0", dark: "#13231b",
      },
      fontFamily: { sans: ["var(--font-jakarta)", "Inter", "system-ui", "sans-serif"] },
      maxWidth: { wrap: "1240px" },
    },
  },
  plugins: [],
};
export default config;
