import type { PositionView } from "./api";

/** Demo wallet: a believable maker account that never signs anything. */
export const DEMO_ACCOUNT = "demo-maker.testnet";

const px = (p: number) => (BigInt(Math.round(p * 1e6)) * 10n ** 12n).toString();
const wnear = (n: number) => (BigInt(Math.round(n * 1e6)) * 10n ** 18n).toString();
const usdc = (n: number) => BigInt(Math.round(n * 1e6)).toString();
const ago = (h: number) => Date.now() - h * 3_600_000;

export function demoPortfolio() {
  const positions: PositionView[] = [
    {
      position_id: "demo-7", owner_id: DEMO_ACCOUNT, market_id: 0,
      ask: { remaining: wnear(2.62), start_price: px(5.04), current_price: px(5.061), end_price: px(5.2), alpha: 1 },
      bid: { remaining: usdc(214.4), start_price: px(4.96), current_price: px(4.947), end_price: px(4.8), alpha: 1 },
      bid_base_capacity: wnear(43.6),
      stats: { base_sold: wnear(1.38), quote_received: usdc(6.98), base_bought: wnear(1.52), quote_spent: usdc(7.53), fills: 9 },
      created_at_ms: ago(31),
    },
    {
      position_id: "demo-12", owner_id: DEMO_ACCOUNT, market_id: 0,
      ask: { remaining: wnear(4), start_price: px(5.1), current_price: px(5.1), end_price: px(5.1), alpha: 0 },
      bid: null,
      bid_base_capacity: "0",
      stats: { base_sold: "0", quote_received: "0", base_bought: "0", quote_spent: "0", fills: 0 },
      created_at_ms: ago(4),
    },
  ];
  return {
    near: 12_480_000_000_000_000_000_000_000n, // 12.48 NEAR
    wb: BigInt(wnear(18.25)), wq: BigInt(usdc(640.1)),
    ib: BigInt(wnear(1.4)), iq: BigInt(usdc(52.75)),
    positions,
  };
}
