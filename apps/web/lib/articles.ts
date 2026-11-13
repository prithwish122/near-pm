export const articles = [
  {
    slug: "curve-maths-explained",
    title: "Curve maths, explained",
    text: "Alpha, marginal price and why a limit order is just a curve that collapsed to a point.",
    body: [
      "Each position is a bounded, executable pricing curve. The maker picks a price range and an integer shape alpha from 0 to 3, so k = 1 + alpha. Integer exponents keep every calculation in exact integer arithmetic.",
      "On an ask side the marginal price after taking a fraction x of the side's capacity is p(x) = p_c + (p_e − p_c)·x^k. The average price paid for that slice is p_c + (p_e − p_c)·x^k / (k + 1).",
      "Everything runs in U256 with checked operations and rounds against the taker, so a maker's value at the pre-fill marginal price never decreases.",
      "Set start price equal to end price and the curve collapses to a point: a limit order, running through the same code path.",
    ],
  },
  {
    slug: "atomic-fills-on-near",
    title: "Atomic fills on NEAR",
    text: "Why every leg settles in one receipt, and what happens when a route goes stale.",
    body: [
      "NEP-141 has no approve and transferFrom, and NEAR cross-contract calls are asynchronous. So all maker balances live in one contract, and a swap is a single ft_transfer_call whose ft_on_transfer fills every leg.",
      "The contract simulates all legs first and commits only if the taker's limit holds. Otherwise it emits swap_rejected and returns the full input: no partial fills, no state change.",
      "Unused input is refunded through the token's own resolve flow. If the payout transfer fails because the recipient is unregistered, the amount is credited to their internal balance and stays withdrawable.",
      "The trade-off is custody: makers deposit into the book. Balances are segregated, only the owner of an account can withdraw it, and per-maker vault sub-accounts are on the roadmap.",
    ],
  },
  {
    slug: "trading-with-agents-over-mcp",
    title: "Trading with agents over MCP",
    text: "List markets, quote, simulate and execute from a budget-capped sub-account.",
    body: [
      "The MCP server exposes list_markets, get_liquidity, get_quote, simulate_route, compare_liquidity, execute_swap and get_agent_balance as structured tools. Read tools need no keys.",
      "execute_swap always simulates first and aborts on failure. It enforces per-trade caps before signing, and signs only from the agent's own sub-account.",
      "The agent's maximum loss is that sub-account's balance, bounded by construction rather than trust. Because ft_transfer_call needs 1 yoctoNEAR, the agent holds a full-access key to its isolated sub-account only; parent keys are never exposed.",
      "Roadmap: an on-chain agent vault that accepts function-call keys and enforces per-trade and daily limits itself.",
    ],
  },
];
