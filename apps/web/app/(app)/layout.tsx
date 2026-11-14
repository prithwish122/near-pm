import AppShell from "@/components/app/AppShell";
import WalletProvider from "@/components/app/WalletProvider";
import { MARKETS, SOLVER_URL } from "@/lib/config";
import { SeedProvider, type Seed } from "@/lib/seed";
import type { CurvesResponse, MarketRow } from "@/lib/api";

/** Asks the solver for a snapshot, giving up quickly so a slow solver never holds the page back. */
async function snapshot<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SOLVER_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(1200) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The same requests the Trade page makes first, so its first render can use them as they are.
  const [markets, curves] = await Promise.all([
    snapshot<MarketRow[]>("/markets"),
    snapshot<CurvesResponse>(`/markets/${MARKETS[0]!.market_id}/curves?points=40`),
  ]);
  const seed: Seed = { markets, curves };
  return (
    <SeedProvider value={seed}>
      <WalletProvider>
        <AppShell>{children}</AppShell>
      </WalletProvider>
    </SeedProvider>
  );
}
