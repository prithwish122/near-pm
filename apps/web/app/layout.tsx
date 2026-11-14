import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

// Fonts load from Google Fonts in globals.css (not next/font), so builds never fetch fonts and can't fail on it.

export const metadata: Metadata = {
  title: { default: "Ebbflow — Curve-shaped liquidity on NEAR", template: "%s · Ebbflow" },
  description: "On Ebbflow an order is a curve, not a price. Atomic multi-maker fills and self-refilling liquidity on NEAR, open to AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
