import type { Metadata } from "next";
import { Martian_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

// Funnel Display / Funnel Sans are newer than next/font's list in Next 14, so globals.css imports them from Google Fonts.
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Ebbflow — Curve-shaped liquidity on NEAR", template: "%s · Ebbflow" },
  description: "On Ebbflow an order is a curve, not a price. Atomic multi-maker fills and self-refilling liquidity on NEAR, open to AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
