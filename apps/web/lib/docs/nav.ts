export interface DocPage {
  slug: string;
  title: string;
  description: string;
}
export interface DocGroup {
  title: string;
  pages: DocPage[];
}

export const DOCS: DocGroup[] = [
  {
    title: "Getting started",
    pages: [
      { slug: "introduction", title: "Introduction", description: "What Ebbflow is, the problem it solves and how the pieces fit together." },
      { slug: "quickstart", title: "Quickstart", description: "From an empty testnet wallet to your first multi-maker fill in about five minutes." },
      { slug: "concepts", title: "Core concepts", description: "Markets, positions, sides, legs, routes and book balances, defined once." },
    ],
  },
  {
    title: "Curves & pricing",
    pages: [
      { slug: "curve-model", title: "The curve model", description: "The pricing formulas for ask and bid sides, and how a curve re-anchors after each fill." },
      { slug: "worked-example", title: "Worked example", description: "One fill computed end to end in raw integers, exactly as the contract does it." },
      { slug: "curve-shapes", title: "Curve shapes (alpha)", description: "How alpha 0 to 3 changes where liquidity sits, with costs for the same range." },
      { slug: "units-and-precision", title: "Units & precision", description: "Token decimals, the 10¹² price scale, U256 intermediates and rounding direction." },
    ],
  },
  {
    title: "Trading",
    pages: [
      { slug: "swap-lifecycle", title: "Swap lifecycle", description: "From quote to settlement: every receipt a swap produces, and what each one does." },
      { slug: "routing", title: "Routing across makers", description: "How the solver splits an order at a common marginal price, with a real two-maker route." },
      { slug: "slippage", title: "Slippage & limits", description: "amount_in_max, min_amount_out and price impact, with the exact formulas." },
      { slug: "refunds", title: "Refunds & failure modes", description: "What happens to your funds in every failure case, and why none can leave a partial fill." },
    ],
  },
  {
    title: "Making markets",
    pages: [
      { slug: "providing-liquidity", title: "Providing liquidity", description: "Deposit, publish a curve and choose a range and shape, step by step." },
      { slug: "recycling", title: "Recycling", description: "How fill proceeds refill the opposite side, with before and after numbers." },
      { slug: "managing-positions", title: "Managing positions", description: "Reading stats, closing, withdrawing and working out your P&L." },
    ],
  },
  {
    title: "Reference",
    pages: [
      { slug: "contract", title: "Contract API", description: "Every change and view method on the book contract, with arguments, deposits and gas." },
      { slug: "events", title: "Events", description: "NEP-297 events emitted by the book, with their payloads." },
      { slug: "errors", title: "Error codes", description: "E01 to E16: what triggers each one and how to fix it." },
      { slug: "solver-api", title: "Solver API", description: "HTTP endpoints for markets, curves, quotes and simulation." },
      { slug: "mcp", title: "MCP server", description: "Tools for AI agents, configuration and the budget caps that bound them." },
      { slug: "intents", title: "NEAR Intents", description: "1Click funding from any chain and the intents market-maker solver." },
      { slug: "deployments", title: "Deployments & costs", description: "Contract addresses, storage deposits and gas for every call." },
    ],
  },
  {
    title: "Security",
    pages: [
      { slug: "security", title: "Guarantees & trust model", description: "Invariants the contract enforces, what you trust, and known limitations." },
    ],
  },
];

export const ALL_PAGES: DocPage[] = DOCS.flatMap((g) => g.pages);
export const findPage = (slug: string) => ALL_PAGES.find((p) => p.slug === slug);
export const groupOf = (slug: string) => DOCS.find((g) => g.pages.some((p) => p.slug === slug));
