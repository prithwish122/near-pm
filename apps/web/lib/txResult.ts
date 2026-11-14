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
  E01_INVALID_MSG: "the transfer message was malformed",
  E02_WRONG_TOKEN: "that token is not traded in this market",
  E03_TOO_MANY_LEGS: "the route used more than 8 makers",
  E04_DUPLICATE_LEG: "the route used the same position twice",
  E05_POSITION_NOT_FOUND: "route no longer valid (a maker closed their order)",
  E06_MARKET_MISMATCH: "a position in the route belongs to another market",
  E07_INSUFFICIENT_LIQUIDITY: "not enough liquidity left on that curve",
  E08_INPUT_EXCEEDED: "the price moved above your maximum spend",
  E09_MIN_OUT_NOT_MET: "the output fell below your minimum",
  E10_INSUFFICIENT_BALANCE: "your book balance is too low for that amount",
  E11_NOT_OWNER: "only the position's owner can do that",
  E12_INVALID_CURVE: "the curve parameters are invalid",
  E13_PAUSED: "trading is paused",
  E14_STORAGE: "not enough storage deposit (register on the Faucet page)",
  E15_CROSSED_POSITION: "your bid must start below your ask",
  E16_MATH_OVERFLOW: "the amounts are too large",
};
const code = (r: string) => r.match(/E\d\d_[A-Z_]+/)?.[0] ?? r.split(":")[0]!;
export const reasonText = (r: string) => REASONS[code(r)] ?? r;

/** Short title for a rejected swap, by reason. */
function rejectTitle(r: string): string {
  switch (code(r)) {
    case "E05_POSITION_NOT_FOUND":
    case "E07_INSUFFICIENT_LIQUIDITY":
      return "Refunded: route no longer valid";
    case "E08_INPUT_EXCEEDED":
    case "E09_MIN_OUT_NOT_MET":
      return "Refunded: price moved past your slippage limit";
    case "E13_PAUSED":
      return "Refunded: trading is paused";
    default:
      return "Refunded: swap rejected";
  }
}

/** The contract's panic message (e.g. "E10_INSUFFICIENT_BALANCE") from a failed tx or receipt, if any. */
export function failureReason(outcome: Pick<TxOutcome, "status" | "receipts_outcome">): string | null {
  const find = (v: unknown): string | null => {
    if (typeof v === "string") {
      const m = v.match(/E\d\d_[A-Z_]+(?:: [^"]*)?/);
      return m ? m[0] : null;
    }
    if (v && typeof v === "object") for (const x of Object.values(v)) { const r = find(x); if (r) return r; }
    return null;
  };
  const statuses = [outcome.status, ...(outcome.receipts_outcome ?? []).map((r) => r.outcome?.status)];
  for (const s of statuses) {
    if (s && typeof s === "object" && "Failure" in s) { const r = find((s as { Failure: unknown }).Failure); if (r) return r; }
  }
  return null;
}

function failureText(s: unknown): string | null {
  if (typeof s === "string") return s;
  if (s && typeof s === "object") for (const x of Object.values(s)) { const r = failureText(x); if (r) return r; }
  return null;
}

/** Any readable failure message (contract panic or runtime error). */
function anyFailure(outcome: Pick<TxOutcome, "status" | "receipts_outcome">): string | null {
  const statuses = [outcome.status, ...(outcome.receipts_outcome ?? []).map((r) => r.outcome?.status)];
  for (const s of statuses) if (s && typeof s === "object" && "Failure" in s) { const r = failureText((s as { Failure: unknown }).Failure); if (r) return r; }
  return null;
}

const allLogs = (outcome: Pick<TxOutcome, "receipts_outcome">) => (outcome.receipts_outcome ?? []).flatMap((r) => r.outcome?.logs ?? []);

export function describeOutcome(outcome: Pick<TxOutcome, "status" | "receipts_outcome">, m: MarketConfig): Described {
  const events = parseEvents(outcome);
  const swap = events.find((e) => e.event === "swap");
  const rejected = events.find((e) => e.event === "swap_rejected");
  const fmtB = (v: string) => `${formatUnits(BigInt(v), m.base_decimals, 6)} ${m.baseSymbol}`;
  const fmtQ = (v: string) => `${formatUnits(BigInt(v), m.quote_decimals, 4)} ${m.quoteSymbol}`;

  if (rejected) {
    const reason = String(rejected.data.reason);
    return {
      tone: "warn",
      title: rejectTitle(reason),
      lines: [`Reason: ${reasonText(reason)}.`, "Your full input was returned and no state changed."],
      requote: code(reason) !== "E13_PAUSED",
    };
  }
  if (swap) {
    const buy = swap.data.side === "buy_base";
    const inF = buy ? fmtQ : fmtB;
    const outF = buy ? fmtB : fmtQ;
    const outToken = buy ? m.base : m.quote;
    const credited = events.find((e) => e.event === "payout_credited" && e.data.token_id === outToken);
    const lines = credited
      ? [`Bought ${outF(swap.data.amount_out)}, credited to your book balance`]
      : [`Received ${outF(swap.data.amount_out)}`];
    lines.push(`Spent ${inF(swap.data.amount_in)}`);
    if (BigInt(swap.data.refund) > 0n) lines.push(`Refunded ${inF(swap.data.refund)} (unused input)`);
    lines.push(`Filled across ${swap.data.legs?.length ?? 0} maker${swap.data.legs?.length === 1 ? "" : "s"} in one transaction.`);
    if (credited) {
      lines.push(`Your wallet isn't registered with ${buy ? m.baseSymbol : m.quoteSymbol}, so the output stayed in the book. Register on the Faucet page, then withdraw it from Portfolio.`);
      return { tone: "warn", title: "Filled: output held in the book", lines };
    }
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
    const amt = isBase ? fmtB(wd.data.amount) : fmtQ(wd.data.amount);
    if (allLogs(outcome).some((l) => l.startsWith("withdraw failed"))) {
      return {
        tone: "warn",
        title: "Withdrawal returned to your book balance",
        lines: [`The token transfer of ${amt} failed, so it was credited back. Make sure your wallet is registered with ${isBase ? m.baseSymbol : m.quoteSymbol} (Faucet page) and try again.`],
      };
    }
    return { tone: "success", title: "Withdrawn", lines: [`Sent ${isBase ? fmtB(wd.data.amount) : fmtQ(wd.data.amount)} to your wallet.`] };
  }
  if (hasFailure(outcome)) {
    const reason = failureReason(outcome);
    if (reason) return { tone: "error", title: "Transaction failed", lines: [`Reason: ${reasonText(reason)} (${code(reason)}).`] };
    const raw = anyFailure(outcome);
    return { tone: "error", title: "Transaction failed", lines: [raw ? `Reason: ${raw}` : "The transaction or one of its receipts failed. Check the explorer for details."] };
  }
  return { tone: "success", title: "Transaction confirmed", lines: [] };
}
