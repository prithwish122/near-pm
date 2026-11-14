"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { CurvesResponse, MarketRow } from "./api";

/**
 * A first snapshot of the book, fetched on the server with the page, so the app's first render already
 * shows prices instead of waiting for the browser to load its code and then ask the solver.
 * Polling takes over from here; null means the server could not get a snapshot in time.
 */
export interface Seed { markets: MarketRow[] | null; curves: CurvesResponse | null }
const SeedCtx = createContext<Seed>({ markets: null, curves: null });

export function SeedProvider({ value, children }: { value: Seed; children: ReactNode }) {
  return <SeedCtx.Provider value={value}>{children}</SeedCtx.Provider>;
}
export const useSeed = () => useContext(SeedCtx);
