import Link from "next/link";
import { C, Callout, H2, Lead, P, Table, UL } from "../ui";

export function Security() {
  return (
    <>
      <Lead>
        What the contract guarantees, what you are trusting when you use it, and what is not done yet. Read this before depositing anything you
        care about.
      </Lead>

      <H2>Guarantees enforced on-chain</H2>
      <Table
        head={["Property", "How"]}
        rows={[
          ["Atomic swaps", "Every leg is simulated on copies before any write. Any failure emits swap_rejected and refunds the full input."],
          ["Taker limits", <>Total input ≤ attached amount (<C key="a">E08</C>) and output ≥ <C key="b">min_amount_out</C> (<C key="c">E09</C>), checked before commit.</>],
          ["No partial fills", "A route either settles every leg or none."],
          ["Makers never trade through their curve", "Costs round up and proceeds round down; the price stays inside [start, end]."],
          ["Segregated balances", "Balances are keyed by (account, token). Only the account itself can withdraw or close its positions (E11)."],
          ["No lost payouts", "Failed payout transfers are credited to the book balance (payout_credited); failed withdrawals are restored."],
          ["Checked maths", "U256 intermediates, checked additions, overflow-checks on in release builds (E16)."],
          ["Bounded work", "At most 8 legs; each leg is O(1), so gas per swap is bounded."],
        ]}
      />

      <H2>What you trust</H2>
      <UL>
        <li><strong className="text-white">The contract code.</strong> It has 37 unit and property tests and was exercised live on testnet, but it is <strong className="text-white">not audited</strong>.</li>
        <li><strong className="text-white">The owner key.</strong> The owner can add markets and pause trading. Pausing blocks swaps and new positions only; it can&apos;t move funds, and withdrawals and closes keep working. The owner can also redeploy the contract code, as with any NEAR contract under a full-access key.</li>
        <li><strong className="text-white">The token contracts.</strong> wNEAR and tUSDC behave as standard NEP-141 tokens.</li>
        <li><strong className="text-white">Not the solver.</strong> Routes are re-priced and validated on-chain; a wrong route can only be refunded or settle within your own limits.</li>
      </UL>

      <H2>Custody</H2>
      <P>
        Maker inventory lives in the book contract so that fills can be atomic. This is a deliberate trade-off: in exchange for single-receipt
        multi-maker settlement, makers trust the contract with custody of deposited funds until they withdraw. Takers only hold funds in the book
        for the duration of one transaction (or when a payout is credited).
      </P>

      <H2>Known limitations</H2>
      <UL>
        <li>Testnet only. A mainnet deployment script exists, but nothing is deployed to mainnet.</li>
        <li>Path dependence for α ≥ 1: splitting a buy into smaller fills is slightly cheaper than one fill. See <Link className="text-mint" href="/docs/curve-model">The curve model</Link>.</li>
        <li>Positions can&apos;t be edited; close and re-create instead.</li>
        <li>The recent-fills history keeps the last 100 fills; use the events for a full history.</li>
        <li>Front-running: a transaction landing before yours can move a curve. Your limits cap the damage; tighten slippage for large trades.</li>
      </UL>

      <H2>Roadmap</H2>
      <UL>
        <li>Independent audit before any mainnet funds.</li>
        <li>Per-maker vault sub-accounts to narrow custody.</li>
        <li>An on-chain agent vault enforcing per-trade and daily limits with function-call keys.</li>
        <li>Fractional α and piecewise curves; an indexer for full history.</li>
      </UL>

      <Callout type="warn" title="Report a vulnerability">
        <p>Please don&apos;t open a public issue for security problems. Contact the team privately through the repository owner.</p>
      </Callout>
    </>
  );
}
