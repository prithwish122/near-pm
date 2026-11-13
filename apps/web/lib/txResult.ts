/** Turns a transaction outcome (wallet or RPC) into something the UI can show. */
import { formatUnits } from "@ebbflow/curve-math";
import type { MarketConfig } from "./config";
import type { TxOutcome } from "./rpc";

export interface EbbEvent { event: string; data: Record<string, any> }

export function parseEvents(outcome: Pick<TxOutcome, "receipts_outcome">): EbbEvent[] {
  const events: EbbEvent[] = [];
  for (const r of outcome.receipts_outcome ?? []) {
    for (const log of r.outcome?.logs ?? []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const j = JSON.parse(log.slice("EVENT_JSON:".length));
        if (j.standard === "ebbflow" && Array.isArray(j.data)) for (const d of j.data) events.push({ event: j.event, data: d });
      } catch {
        /* ignore malformed logs */
      }
    }
  }
  return events;
}

/** True if the transaction or any receipt failed. */
export function hasFailure(outcome: Pick<TxOutcome, "status" | "receipts_outcome">): boolean {
  const failed = (s: unknown) => typeof s === "object" && s !== null && "Failure" in s;
  return failed(outcome.status) || (outcome.receipts_outcome ?? []).some((r) => failed(r.outcome?.status));
}

export interface Described {
  tone: "success" | "warn" | "error";
  title: string;
  lines: string[];
  /** Offer a re-quote button (stale route). */
  requote?: boolean;
}

const REASONS: Record<string, string> = {
  E05_POSITION_NOT_FOUND: "route no longer valid (a maker closed their order)",
  E07_INSUFFICIENT_LIQUIDITY: "not enough liquidity left on that curve",
  E08_INPUT_EXCEEDED: "the price moved above your maximum spend",
  E09_MIN_OUT_NOT_MET: "the output fell below your minimum",
  E13_PAUSED: "trading is paused",
};
const reasonText = (r: string) => REASONS[r.split(":")[0]!] ?? r;

export function describeOutcome(outcome: Pick<TxOutcome, "status" | "receipts_outcome">, m: MarketConfig): Described {
  const events = parseEvents(outcome);
  const swap = events.find((e) => e.event === "swap");
  const rejected = events.find((e) => e.event === "swap_rejected");
  const fmtB = (v: string) => `${formatUnits(BigInt(v), m.base_decimals, 6)} ${m.baseSymbol}`;
  const fmtQ = (v: string) => `${formatUnits(BigInt(v), m.quote_decimals, 4)} ${m.quoteSymbol}`;

  if (rejected) {
    return {
      tone: "warn",
      title: "Refunded: route no longer valid",
      lines: [`Reason: ${reasonText(String(rejected.data.reason))}.`, "Your full input was returned and no state changed."],
      requote: true,
    };
  }
  if (swap) {
    const buy = swap.data.side === "buy_base";
    const inF = buy ? fmtQ : fmtB;
    const outF = buy ? fmtB : fmtQ;
    const lines = [`Received ${outF(swap.data.amount_out)}`, `Spent ${inF(swap.data.amount_in)}`];
    if (BigInt(swap.data.refund) > 0n) lines.push(`Refunded ${inF(swap.data.refund)} (unused input)`);
    lines.push(`Filled across ${swap.data.legs?.length ?? 0} maker${swap.data.legs?.length === 1 ? "" : "s"} in one transaction.`);
    return { tone: "success", title: "Filled", lines };
  }
  const created = events.find((e) => e.event === "position_created");
  if (created) return { tone: "success", title: `Position #${created.data.position_id} published`, lines: ["It is live in the book now."] };
  const closed = events.find((e) => e.event === "position_closed");
  if (closed)
    return {
      tone: "success",
      title: `Position #${closed.data.position_id} closed`,
      lines: [`Returned ${fmtB(closed.data.returned_base)} and ${fmtQ(closed.data.returned_quote)} to your book balance.`],
    };
  const dep = events.find((e) => e.event === "deposit");
  if (dep) {
    const isBase = dep.data.token_id === m.base;
    return { tone: "success", title: "Deposited", lines: [`Credited ${isBase ? fmtB(dep.data.amount) : fmtQ(dep.data.amount)} to your book balance.`] };
  }
  const wd = events.find((e) => e.event === "withdraw");
  if (wd) {
    const isBase = wd.data.token_id === m.base;
    return { tone: "success", title: "Withdrawn", lines: [`Sent ${isBase ? fmtB(wd.data.amount) : fmtQ(wd.data.amount)} to your wallet.`] };
  }
  if (hasFailure(outcome)) return { tone: "error", title: "Transaction failed", lines: ["The transaction or one of its receipts failed. Check the explorer for details."] };
  return { tone: "success", title: "Transaction confirmed", lines: [] };
}
