import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", weight: ["300", "400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Ebbflow — Curve-shaped liquidity on NEAR",
  description: "On Ebbflow an order is a curve, not a price. Atomic multi-maker fills and self-refilling liquidity on NEAR, open to AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
