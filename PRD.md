# Ebbflow on NEAR — Product Requirements Document

| Field | Value |
|---|---|
| **Document** | Product Requirements Document (detailed) |
| **Version** | v2.0 — 14 Nov 2026 |
| **Source** | `Ebbflow_NEAR_Hackathon.docx` |
| **Status** | Draft for build |
| **Event** | NEAR HACKATHON 2026 (online). Build window 1–14 Nov; **submissions close 14 Nov 2026, 23:59 UTC**; judging 16–18 Nov; results by 18 Nov |
| **Tracks** | Primary: **Unstoppable DeFi** · Secondary: **Agent Economy** |
| **Prizes** | Per track $10K / $3K / $2K + $55K grand prize, paid in NEAR |
| **Chain** | NEAR **testnet** for the core book; NEAR Intents on **mainnet** with tiny amounts (stretch; Intents has no testnet) |
| **Judges** | Human panel + AI judges (Claude Code and Codex) reading the repository |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Background and problem](#2-background-and-problem)
3. [Goals, non-goals and success metrics](#3-goals-non-goals-and-success-metrics)
4. [Personas](#4-personas)
5. [User journeys](#5-user-journeys)
6. [User stories and acceptance criteria](#6-user-stories-and-acceptance-criteria)
7. [Domain model and curve mathematics](#7-domain-model-and-curve-mathematics)
8. [System architecture](#8-system-architecture)
9. [Smart contract specification](#9-smart-contract-specification)
10. [Test token and deployment specification](#10-test-token-and-deployment-specification)
11. [Solver API specification](#11-solver-api-specification)
12. [MCP server specification](#12-mcp-server-specification)
13. [Web application specification](#13-web-application-specification)
14. [NEAR Intents solver (stretch)](#14-near-intents-solver-stretch)
15. [Non-functional requirements](#15-non-functional-requirements)
16. [Security and threat model](#16-security-and-threat-model)
17. [Test plan](#17-test-plan)
18. [Repository structure and engineering conventions](#18-repository-structure-and-engineering-conventions)
19. [Build plan and milestones](#19-build-plan-and-milestones)
20. [Submission and judging plan](#20-submission-and-judging-plan)
21. [Risks and mitigations](#21-risks-and-mitigations)
22. [Roadmap (post-hackathon)](#22-roadmap-post-hackathon)
23. [Open questions and decisions log](#23-open-questions-and-decisions-log)
24. [Glossary](#24-glossary)

Requirement IDs use the prefix of their area (`CON-` contract, `SOL-` solver, `MCP-`, `WEB-`, `NFR-`, `TST-`). Priorities: **P0** = must ship for judging, **P1** = should ship, **P2** = stretch / roadmap.

---

## 1. Executive summary

**One-line pitch.** On most order books an order is one price. On Ebbflow an order is a **curve across a price range**. One NEAR transaction fills a trade across many makers at once, **all or nothing**, and whatever a maker earns **automatically refills the other side** of their curve, so liquidity keeps quoting both ways with no bot. AI agents and NEAR Intents users can trade against the same book.

**Submission positioning.** Ebbflow brings shaped, self-refilling maker liquidity to NEAR, with atomic multi-maker fills and an agent-ready API, and plugs that liquidity into NEAR Intents so swaps from any chain can be filled by it.

**What we will build (P0):**

| # | Deliverable | Summary |
|---|---|---|
| 1 | `ebbflow` contract (Rust, near-sdk) on testnet | Maker balances, immutable curve positions, exact integer curve maths, atomic multi-maker swaps via `ft_transfer_call`, recycling, NEP-297 events, view quotes |
| 2 | Test USDC token (NEP-141) | 6-decimal faucet token for demo wallets |
| 3 | Solver API (TypeScript, stateless) | Reads positions over RPC, finds the best split across ≤ 8 makers, returns signable transaction args |
| 4 | MCP server (TypeScript) | Agent tools: list markets, liquidity, quote, simulate, execute from a budgeted sub-account |
| 5 | Web app (React + Vite) | Trade, Make (curve visualiser), Portfolio, Activity, Faucet |
| 6 | Tests + README + demo video | Unit, property and integration tests; README written for human and AI judges |

---

## 2. Background and problem

### 2.1 Today's options

| Model | How liquidity is expressed | Pain |
|---|---|---|
| **Central limit order book** | Each order is one price and size | To spread over a range a maker posts many orders and runs a bot to cancel/repost. Proceeds sit idle until the maker acts. Each repost is a transaction. |
| **AMM (constant product / concentrated)** | Liquidity follows a fixed formula; LPs share a pool | The shape is dictated by the protocol, not the maker. LPs cannot express individual views; all LPs share one curve. |

### 2.2 The Ebbflow model

Each maker position is a **bounded, executable pricing curve**. The maker chooses the range and the shape. The contract quotes and fills directly from that curve, and the maker can withdraw at any time.

Three core mechanics:

1. **Curve pricing.** The more a taker takes from one maker, the further along the curve they move, so large size pays a worse price. Makers are never emptied at one price.
2. **Multi-maker routing.** A solver splits a trade across several makers for the best total price; the contract settles all legs in one receipt.
3. **Inventory recycling.** What a maker receives on one side is added to their opposite side **without moving that side's marginal price**, so the position keeps quoting both ways with no extra transaction.

**Key property:** if `start_price == end_price` the curve collapses to a point — exactly a limit order. A classic order book is a special case of Ebbflow and runs through the same code path.

### 2.3 Why NEAR, why now

| Hackathon theme | What judges look for | Ebbflow's answer |
|---|---|---|
| Unstoppable DeFi | Exchanges/trading agents that settle via NEAR Intents | Curve-based order book on NEAR + a solver that quotes Intents swap requests from Ebbflow curves |
| Agent Economy | Agents with budgets that transact on their own | MCP server for quotes and simulated routes; agents trade from a budgeted NEAR sub-account |
| NEAR stack usage | Intents, chain abstraction, named accounts, sub-accounts, access keys | Rust contract, NEP-141 `ft_transfer_call` settlement, NEP-297 events, NEP-145 storage, sub-accounts as agent spending limits |
| Originality | Something not already on NEAR | Curve-shaped maker orders with inventory recycling; limit orders are a special case of the same code path |

---

## 3. Goals, non-goals and success metrics

### 3.1 Goals

| ID | Goal | Priority |
|---|---|---|
| G1 | Contract on testnet with curve fills, recycling and atomic multi-maker routes, enforcing the taker's limit on-chain | P0 |
| G2 | One end-to-end path through a web UI: publish curve → quote → execute → see recycling → withdraw | P0 |
| G3 | Solver API returning optimal routes and exact transaction arguments | P0 |
| G4 | MCP server enabling an agent to quote, simulate and execute from a budget-capped account | P0 |
| G5 | Tests and README strong enough for AI judges to verify correctness from the repo alone | P0 |
| G6 | NEAR Intents solver on mainnet with tiny amounts | P2 |
| G7 | Per-maker vault sub-accounts (self-custody) | P2 (roadmap) |

### 3.2 Non-goals (this build)

- Protocol fees, maker rebates, governance, or any token.
- Order types beyond curve/limit (no stop, post-only, time-in-force flags).
- Mutable curves (a maker closes and re-creates instead).
- Mainnet deployment of the book; a formal audit.
- A dedicated indexer/database (activity is served from an on-chain ring buffer + NEP-297 logs).
- Chain Signatures; autonomous market-making agent on NEAR AI Cloud (roadmap only).
- Mobile-native apps (responsive web only).

### 3.3 Success metrics

| Metric | Target at submission |
|---|---|
| End-to-end demo on testnet (two wallets + one agent) | Works live and in the video |
| Rust unit + property tests | All green; property suite ≥ 1,000 cases per property |
| Integration tests (near-workspaces) | All green, including refund and failure paths |
| Gas for an 8-leg swap | < 100 Tgas (hard ceiling 300 Tgas) |
| Solver quote latency (p95, testnet RPC) | < 1 s |
| Rounding error vs. reference model | ≤ 1 atomic unit, always in the maker's favour |
| Hosted demo uptime 14–18 Nov | No unplanned outage during judging |

---

## 4. Personas

| Persona | Example | Context | Needs | Frustrations today |
|---|---|---|---|---|
| **Curve maker** | Priya | Holds wNEAR and USDC, wants to earn spread passively | Set range + shape once; earn repeatedly; withdraw any time; see what she has earned | Running bots; idle proceeds; AMM shape she does not control |
| **Limit maker** | Arjun | Wants to sell at one price | Simple single-price order; cancel any time | None — but should not need a separate product |
| **Taker** | Rahul | Wants 200 wNEAR at the best total price | One signature, best price across makers, hard max spend, all-or-nothing | Partial fills, slippage surprises, multiple transactions |
| **AI agent** | `agent.<team>.testnet` | Autonomous trader with a budget | Machine-readable quotes, dry-run before execution, hard spending cap | Unstructured UIs; unbounded key access |
| **Agent operator** | Developer | Deploys the agent | Max loss capped by construction, not by trust | Giving agents keys to main accounts |
| **Intents user** (P2) | Swapper on another chain | Submits an intent | Fill from deep, shaped liquidity | Thin liquidity for some pairs |
| **Judge** | Human / AI | Reviews in limited time | Understand in 5 seconds; verify correctness in the repo | Hand-wavy READMEs, untested maths |

---

## 5. User journeys

### 5.1 Maker: publish a curve (Priya)

1. Connects wallet on **Make** page; app checks storage registration on the book and on both tokens and offers one-click registration if missing.
2. Enters: ask inventory 400 wNEAR from $5.04 → $5.20; bid inventory 2,000 USDC from $4.96 → $4.80; alpha = 1.
3. Visualiser draws both sides; moving the alpha slider reshapes the curves instantly; a table shows price per 25% slice.
4. Clicks **Publish**. Wallet prompts a batch: `ft_transfer_call` (wNEAR, `deposit`), `ft_transfer_call` (USDC, `deposit`), `create_position` (with storage deposit).
5. Position appears in **Portfolio** with current marginal prices and remaining inventory.

### 5.2 Maker: limit order (Arjun)

1. Toggles **Limit order** on the ask side; start = end = $5.06; inventory 100 wNEAR; bid side empty.
2. Same publish flow. The curve renders as a single vertical bar at $5.06.

### 5.3 Taker: buy (Rahul)

1. On **Trade**, picks wNEAR/USDC, **Buy**, "200 wNEAR", max slippage 0.5%.
2. App calls `POST /quote`; shows route: Priya ≈141.42 wNEAR, Arjun ≈58.58 wNEAR, average ≈$5.0506, total ≈$1,010.11, max spend $1,015.17.
3. Clicks **Execute**: one `ft_transfer_call` of USDC to the book carrying the route.
4. Success screen: received exactly 200 wNEAR, spent $1,010.11, refunded $5.06, tx link. Activity shows two fills and Priya's recycling.

### 5.4 Taker: stale route refunds

1. Rahul obtains a quote; Arjun closes his order before Rahul signs.
2. Rahul executes; the contract detects a missing position, makes no state change and returns his full USDC.
3. UI shows **Refunded — route no longer valid**, with a **Re-quote** button.

### 5.5 Agent trade

1. Agent calls `list_markets` → `get_quote` (buy 5 wNEAR) → `simulate_route` (ok) → `execute_swap`.
2. MCP server checks per-trade cap, signs from `agent.<team>.testnet`, returns tx hash and outcome.

### 5.6 Maker: close and withdraw

1. In **Portfolio**, Priya clicks **Close** on a position → remaining inventories return to her internal balance.
2. Clicks **Withdraw** per token → tokens arrive in her wallet.

---

## 6. User stories and acceptance criteria

| ID | Story | Acceptance criteria | Pri |
|---|---|---|---|
| US-M1 | As a maker I deposit tokens into the book | `ft_transfer_call` with `{"action":"deposit"}` credits `get_balance(me, token)` by exactly `amount`; `deposit` event emitted; returns `"0"` (nothing refunded) | P0 |
| US-M2 | As a maker I publish a curve position | `create_position` debits balances by side inventories, stores position, emits `position_created`; invalid params rejected with the error codes in §9.9 | P0 |
| US-M3 | As a maker I publish a limit order | `start_price == end_price` accepted; fills at exactly that price regardless of size | P0 |
| US-M4 | As a maker I close a position at any time | Only owner may close; remaining ask/bid inventory credited to balance; storage refunded; `position_closed` emitted | P0 |
| US-M5 | As a maker I withdraw to my wallet | `withdraw` sends tokens; on transfer failure, balance is restored by callback | P0 |
| US-M6 | As a maker my proceeds refill my opposite side | After a fill on side S, opposite side's remaining inventory increases by the proceeds and its current price is unchanged; `fill.recycled` field equals proceeds | P0 |
| US-M7 | As a maker I see my earnings | Portfolio shows cumulative bought/sold and realised spread per position | P1 |
| US-T1 | As a taker I get a quote | `/quote` returns route, legs, average price, price impact, limit, and exact tx args within 1 s | P0 |
| US-T2 | As a taker I execute in one signature | One `ft_transfer_call`; all legs fill in one receipt or none do | P0 |
| US-T3 | As a taker unused input is refunded | Input not consumed by legs is returned in the same flow via `ft_resolve_transfer` | P0 |
| US-T4 | As a taker my limit is enforced on-chain | Buy: total cost ≤ attached amount. Sell: total output ≥ `min_amount_out`. Otherwise full refund, no state change | P0 |
| US-T5 | As a taker I can sell base | Route against bid sides works symmetrically | P0 |
| US-T6 | As a taker I never lose output if unregistered | If payout `ft_transfer` fails, the amount is credited to my internal balance and is withdrawable | P0 |
| US-A1 | As an agent I discover markets and liquidity | `list_markets`, `get_liquidity` return structured JSON | P0 |
| US-A2 | As an agent I simulate before executing | `simulate_route` returns pass/fail with reason and expected amounts | P0 |
| US-A3 | As an agent I execute within a budget | `execute_swap` refuses trades above configured per-trade cap; agent signs only from its sub-account | P0 |
| US-A4 | As an agent I compare liquidity | `compare_liquidity` shows Ebbflow vs. a flat book for a size | P1 |
| US-J1 | As a judge I verify correctness | `cargo test`, integration tests and TS tests run from documented commands; README explains math, custody, atomicity | P0 |

---

## 7. Domain model and curve mathematics

### 7.1 Entities

| Entity | Fields | Notes |
|---|---|---|
| **Market** | `id: u32`, `base: AccountId`, `quote: AccountId`, `base_decimals: u8`, `quote_decimals: u8`, `paused: bool` | Registered by owner; e.g. `wrap.testnet` (24) / `usdc.<team>.testnet` (6) |
| **Position** | `id: u64`, `owner: AccountId`, `market_id: u32`, `ask: Option<Side>`, `bid: Option<Side>`, `created_at: u64`, `stats: PositionStats` | Curve params immutable except the evolving `current_price`/`remaining` |
| **Side** | `remaining: u128`, `start_price: u128`, `current_price: u128`, `end_price: u128`, `alpha: u8` | Ask `remaining` is base; bid `remaining` is quote |
| **PositionStats** | `base_sold`, `quote_received`, `base_bought`, `quote_spent`, `fills: u32` | Drives the Portfolio "earned" figure |
| **Balance** | `(AccountId, TokenId) → u128` | Internal, segregated per account |

### 7.2 Units and fixed point

| Quantity | Representation |
|---|---|
| Token amounts | `u128` atomic units (`U128` string in JSON) |
| Price | `u128` = **quote atomic units per one whole base token**, scaled by `PRICE_SCALE = 10^12` |
| Fractions (internal) | U256 with `FRAC_SCALE = 10^18` |
| Intermediate products | **U256** (`uint::construct_uint!`), checked arithmetic, panic on overflow |

Example: $5.04 with 6-decimal USDC → `5_040_000 × 10^12 = 5.04 × 10^18`.
Cost of 100 wNEAR at $5.04: `100e24 × 5.04e18 / (1e24 × 1e12) = 504e6` = 504 USDC. (`100e24 × 5.04e18 ≈ 5e44` > u128 max ≈ 3.4e38 — hence U256.)

Helper: `value(base_amt, price) = base_amt × price / (10^base_decimals × PRICE_SCALE)`.

### 7.3 Curve shape

`alpha ∈ {0, 1, 2, 3}` and `k = 1 + alpha`. Integer exponents keep all maths in exact integer arithmetic (no fixed-point `pow`, `exp`, `ln`).

Both sides are parameterised by **base amount** taken, as a fraction `x` of the side's **base capacity** `B`:

| | Ask side (maker sells base) | Bid side (maker buys base) |
|---|---|---|
| Inventory `R` | base | quote |
| Base capacity `B` | `B = R` | `B = R / avg_price`, where `avg_price = p_c − (p_c − p_e)/(k+1)` (i.e. base buyable if the full remaining curve is consumed) |
| Marginal price after taking `x` | `p(x) = p_c + (p_e − p_c)·x^k` (rises) | `p(x) = p_c − (p_c − p_e)·x^k` (falls) |
| Quote for taking `Δ` base, `x = Δ/B` | **cost** = `value(Δ, p_c + (p_e − p_c)·x^k/(k+1))` | **output** = `value(Δ, p_c − (p_c − p_e)·x^k/(k+1))` |
| State update | `p_c ← p(x)`, `R ← R − Δ` | `p_c ← p(x)`, `R ← R − output` |

Interpretation:
- `alpha = 0` → linear price in size: liquidity evenly spread across the range.
- Higher `alpha` → price moves slowly at first: liquidity bunched near the current price.
- `p_c == p_e` → constant price: **limit order**.

Derivation (ask): cost = `∫₀^Δ p(s/B) ds` = `Δ·p_c + (p_e − p_c)·B·x^(k+1)/(k+1)` = `Δ·[p_c + (p_e − p_c)·x^k/(k+1)]`.

### 7.4 Path dependence and the one-leg rule

Each side stores only its *remaining* segment. For `alpha = 0` the tail of a line is the same line, so filling 50 + 50 equals filling 100 (path-independent). For `alpha > 0` the remaining segment is re-parameterised after each fill, so splitting is not exactly equivalent. Therefore:

- **CON-R1** A route may contain **at most one leg per position**.
- **SOL-R1** The solver prices legs with a TypeScript port that is byte-for-byte equivalent to the contract's integer maths, verified on shared fixtures and against the `quote_leg` view.

### 7.5 Recycling

On a fill of `Δ` base against position `P`:

| Fill side | Maker receives | Recycled into | Price effect |
|---|---|---|---|
| Ask (taker buys base) | `cost` quote | `P.bid.remaining += cost` | `P.bid.current_price` unchanged → bid base capacity grows |
| Bid (taker sells base) | `Δ` base | `P.ask.remaining += Δ` | `P.ask.current_price` unchanged |

If the opposite side is `None` (maker published one side only), proceeds are credited to the maker's **internal balance** instead (decision D4, §23).

**Exhausted side.** When a side is fully consumed, `p_c = p_e` and `R = 0`. If proceeds later recycle into it, they quote at `p_e` as a flat level until the maker closes and re-creates. Documented in the README as known behaviour.

### 7.6 Rounding policy (always against the taker)

| Computation | Rounding |
|---|---|
| `x = Δ·FRAC_SCALE / B` | **up** |
| `x^k` (iterative fixed-point multiply) | **up** at each step |
| Ask cost | **up** |
| Bid output | **down** |
| Bid base capacity `B` | **down** |
| New `p_c` (ask) | **up**; (bid) **down** |

Invariant: for any fill, maker's `(base, quote)` value at the pre-fill marginal price never decreases.

### 7.7 Validation rules

| Rule | Error |
|---|---|
| Ask: `0 < start_price ≤ end_price` | `E12_INVALID_CURVE` |
| Bid: `start_price ≥ end_price > 0` | `E12_INVALID_CURVE` |
| `alpha ≤ 3` | `E12_INVALID_CURVE` |
| `remaining > 0` for each provided side | `E12_INVALID_CURVE` |
| At least one side present | `E12_INVALID_CURVE` |
| Both sides present → `bid.start_price < ask.start_price` | `E15_CROSSED_POSITION` |

### 7.8 Worked example with the real formula

Market wNEAR/USDC, mid ≈ $5.00.

**Priya:** ask 400 wNEAR, $5.04 → $5.20, alpha = 1 (k = 2); bid 2,000 USDC, $4.96 → $4.80, alpha = 1.
**Arjun:** ask 100 wNEAR at $5.06 (limit).

Priya's ask marginal price after taking `Δ`: `5.04 + 0.16·(Δ/400)²`.

| Priya cumulative sold | Marginal price | Slice avg price |
|---|---|---|
| 100 | $5.0500 | $5.0433 |
| 200 | $5.0800 | $5.0633 |
| 300 | $5.1300 | $5.1033 |
| 400 | $5.2000 | $5.1633 |

**Rahul buys 200 wNEAR.** Taking all 200 from Priya would push her marginal to $5.08 > Arjun's $5.06, so the optimum equalises marginals at **p\* = $5.06**: Priya supplies until `5.04 + 0.16x² = 5.06` → `x² = 0.125`, `x ≈ 0.35355`, `Δ ≈ 141.42`.

| Leg | Base | Avg price | Cost |
|---|---|---|---|
| Priya | 141.42 wNEAR | 5.04 + 0.16·0.125/3 = $5.04667 | $713.70 |
| Arjun | 58.58 wNEAR | $5.06 | $296.41 |
| **Total** | **200 wNEAR** | **$5.05056** | **$1,010.11** |

With 0.5% slippage the app attaches $1,015.17. On success Rahul receives exactly 200 wNEAR and $5.06 is refunded.

**Recycling (Priya):**

| | Before | After |
|---|---|---|
| Ask remaining | 400 wNEAR | 258.58 wNEAR |
| Ask current price | $5.04 | $5.06 |
| Bid remaining | 2,000 USDC | 2,713.70 USDC |
| Bid current price | $4.96 | **$4.96 (unchanged)** |

Later Neha sells 100 wNEAR into Priya's bid; Priya buys back near $4.96 having sold near $5.05 — spread earned with no bot and no transaction from Priya. (These numbers become a test fixture: `TST-U10`.)

---

## 8. System architecture

### 8.1 Components

| Layer | Component | Tech | Responsibility |
|---|---|---|---|
| On-chain | `ebbflow` contract | Rust, near-sdk 5.x | Balances, positions, curve maths, swaps, recycling, events, views |
| On-chain | NEP-141 tokens | `wrap.testnet`, test USDC | `ft_transfer_call` carries route + limit into `ft_on_transfer` |
| Shared | `curve-math` package | TypeScript (bigint) | Exact port of contract maths; used by solver, MCP and web |
| Off-chain | Solver API | TypeScript, Node, Fastify/Hono | Read positions, compute optimal routes, build tx args |
| Off-chain | MCP server | TypeScript, `@modelcontextprotocol/sdk` | Agent tools; signs from agent sub-account |
| Off-chain | Intents solver (P2) | TypeScript | Quote NEAR Intents swap requests from Ebbflow |
| Client | Web app | React, Vite, near-api-js, NEAR Wallet Selector, charting (Recharts/D3) | Make, Trade, Portfolio, Activity, Faucet |

### 8.2 Architecture diagram

```
   ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐
   │   Web app    │    │  AI agent    │    │ NEAR Intents (P2)     │
   │ React + WS   │    │ (MCP client) │    │ swap requests         │
   └──────┬───────┘    └──────┬───────┘    └──────────┬────────────┘
          │ HTTPS             │ MCP (stdio/HTTP)      │
          │            ┌──────▼───────┐    ┌──────────▼────────────┐
          ├───────────►│  MCP server  │    │  Intents solver (P2)  │
          │            └──────┬───────┘    └──────────┬────────────┘
          │                   │ HTTPS                 │
          │            ┌──────▼───────────────────────▼──┐
          └───────────►│      Solver API (stateless)     │
                       │   uses @ebbflow/curve-math      │
                       └──────────────┬──────────────────┘
                                      │ RPC view calls (free)
  wallet-signed txs                   │
  (ft_transfer_call,           ┌──────▼─────────────────────────┐
   create_position, ...) ─────►│   ebbflow contract (testnet)   │◄── wrap.testnet
                               │  balances · positions · swaps  │◄── usdc.<team>.testnet
                               │  NEP-297 events · ring buffer  │
                               └────────────────────────────────┘
```

### 8.3 Swap sequence (buy base)

```
Taker wallet        USDC token            ebbflow                 wrap.testnet
    │ ft_transfer_call(book, 1015.17, msg)    │                         │
    │──────────────────►│                     │                         │
    │                   │ ft_on_transfer(rahul, 1015.17, msg)           │
    │                   │────────────────────►│                         │
    │                   │                     │ simulate all legs       │
    │                   │                     │ ok? commit legs,        │
    │                   │                     │ recycle, emit events    │
    │                   │                     │ ft_transfer(rahul, 200) │
    │                   │                     │────────────────────────►│
    │                   │   return unused=5.06│                         │
    │                   │◄────────────────────│                         │
    │                   │ ft_resolve_transfer │                         │
    │  refund 5.06 USDC │ (refund unused)     │  on_payout callback     │
    │◄──────────────────│                     │◄────────────────────────│
    │                   │                     │ failed? credit internal │
```

All fills, limit checks and recycling happen inside **one** `ft_on_transfer` execution. NEAR cross-contract calls are asynchronous, so atomicity comes from doing every fill in a single contract call rather than chaining contracts.

### 8.4 Key design decisions

| # | Decision | Rationale |
|---|---|---|
| AD1 | All maker balances in one contract | NEP-141 has no `approve/transferFrom`; a single contract is what makes multi-maker fills atomic on NEAR |
| AD2 | Single-receipt settlement | Async cross-contract calls cannot be atomic across contracts |
| AD3 | Limit enforced on-chain | Solver can be stale/wrong; a bad quote can never cause a bad fill |
| AD4 | Legs specify **base amount** | Avoids solving a degree-(k+1) polynomial on-chain; buy-side limit is the attached amount itself |
| AD5 | Simulate-then-commit | Rejection leaves state untouched without relying on panics; allows a `swap_rejected` event |
| AD6 | `MAX_LEGS = 8` | Bounded gas |
| AD7 | Integer alpha 0–3 | Exact integer maths; enough expressiveness for the demo |
| AD8 | Stateless solver | No database to host or keep in sync; reads are free RPC views |
| AD9 | Agent budget = sub-account balance | Max loss bounded by construction, not by trust |

---

## 9. Smart contract specification

### 9.1 Contract state

```rust
#[near(contract_state)]
pub struct Ebbflow {
    owner_id: AccountId,
    markets: Vector<Market>,                              // id = index
    positions: IterableMap<u64, Position>,
    positions_by_market: LookupMap<u32, IterableSet<u64>>,
    positions_by_owner: LookupMap<AccountId, IterableSet<u64>>,
    balances: LookupMap<(AccountId, AccountId), u128>,    // (account, token) -> amount
    storage: LookupMap<AccountId, StorageBalance>,        // NEP-145
    recent_fills: Vector<FillRecord>,                     // ring buffer, cap 100
    recent_head: u32,
    next_position_id: u64,
    paused: bool,                                         // blocks new positions/swaps only
}
```

### 9.2 Types (JSON)

```rust
pub struct SideInput {           // create_position input
    pub amount: U128,            // base for ask, quote for bid
    pub start_price: U128,
    pub end_price: U128,
    pub alpha: u8,
}

pub enum SwapSide { BuyBase, SellBase }   // serde: "buy_base" | "sell_base"

pub struct Leg { pub position_id: U64, pub base_amount: U128 }

pub struct SwapMsg {
    pub market_id: u32,
    pub side: SwapSide,
    pub legs: Vec<Leg>,
    pub min_amount_out: U128,    // buy: Σ base_amount; sell: min quote
    pub recipient: Option<AccountId>,
}

#[serde(tag = "action", rename_all = "snake_case")]
pub enum TransferMsg { Deposit, Swap(SwapMsg) }
```

### 9.3 Change methods

| ID | Method | Access / deposit | Behaviour | Pri |
|---|---|---|---|---|
| CON-1 | `new(owner_id)` | init | Initialise state | P0 |
| CON-2 | `ft_on_transfer(sender_id, amount, msg) -> PromiseOrValue<U128>` | Called by a token of a registered market | Parses `TransferMsg`. `Deposit` → credit balance, return `0`. `Swap` → §9.5. Unparseable msg or unknown token → return `amount` (full refund) | P0 |
| CON-3 | `create_position(market_id, ask: Option<SideInput>, bid: Option<SideInput>) -> U64` | `#[payable]`; attached ≥ storage cost of the new position | Validate (§7.7); debit balances; store; index; emit `position_created`; refund excess deposit | P0 |
| CON-4 | `close_position(position_id)` | Owner only, 1 yocto | Credit remaining inventories to owner balance; remove indexes; refund storage NEAR; emit `position_closed` | P0 |
| CON-5 | `withdraw(token_id, amount: Option<U128>)` | 1 yocto | Debit balance (all if `None`); `ft_transfer` to caller (≤ 30 Tgas) then `on_withdraw` callback; on failure re-credit; emit `withdraw` | P0 |
| CON-6 | `on_withdraw(account, token, amount)` | `#[private]` | Restore balance if promise failed | P0 |
| CON-7 | `on_payout(account, token, amount)` | `#[private]` | If swap payout failed, credit `account`'s internal balance and emit `payout_credited` | P0 |
| CON-8 | `add_market(base, quote, base_decimals, quote_decimals) -> u32` | Owner only | Register market; emit `market_added` | P0 |
| CON-9 | `set_paused(paused)` | Owner only | Blocks `create_position` and swaps; **never** blocks close/withdraw | P1 |
| CON-10 | `storage_deposit / storage_withdraw / storage_balance_of / storage_balance_bounds` | NEP-145 | Covers balance entries; min 0.01 NEAR | P0 |

There is **no** method by which the owner or anyone other than the account itself can move an account's balance or close its positions.

### 9.4 View methods

| ID | Method | Returns |
|---|---|---|
| CON-V1 | `get_markets()` | `Vec<MarketView>` |
| CON-V2 | `get_positions(market_id, from_index: u32, limit: u32)` | `Vec<PositionView>` (incl. derived bid base capacity, best price per side) |
| CON-V3 | `get_position(position_id)` | `Option<PositionView>` |
| CON-V4 | `get_positions_by_owner(account_id)` | `Vec<PositionView>` |
| CON-V5 | `get_balance(account_id, token_id)` | `U128` |
| CON-V6 | `quote_leg(position_id, side, base_amount)` | `{ amount_quote, new_price, ok, error? }` |
| CON-V7 | `simulate_swap(msg: SwapMsg, amount: U128)` | `{ ok, error?, legs: [{position_id, base, quote, new_price}], amount_in_used, amount_out, refund }` |
| CON-V8 | `get_recent_fills(limit)` | Last ≤ 100 `FillRecord`s, newest first |
| CON-V9 | `get_config()` | `{ owner_id, max_legs, price_scale, paused, version }` |

### 9.5 Swap algorithm (inside `ft_on_transfer`)

```
fn swap(sender, token, amount, msg):
  market = markets[msg.market_id]            else E06
  require !paused                             else E13
  input_token = (side == BuyBase) ? market.quote : market.base
  require token == input_token                else E02
  require 1 <= legs.len() <= MAX_LEGS         else E03
  require no duplicate position_id            else E04

  // ---- simulate (no writes) ----
  for leg in legs:
    pos = positions[leg.position_id]          else E05
    require pos.market_id == msg.market_id    else E06
    s = (BuyBase ? pos.ask : pos.bid)         else E07
    require leg.base_amount <= capacity(s)    else E07
    q = (BuyBase ? ask_cost : bid_output)(s, leg.base_amount)
    record(leg, q, new_price)

  if BuyBase:
    in_used = Σ q;  out = Σ base_amount
    require in_used <= amount                 else E08
  else:
    in_used = Σ base_amount; out = Σ q
    require in_used <= amount                 else E08
  require out >= min_amount_out               else E09

  if any error: emit swap_rejected{reason}; return amount  // full refund

  // ---- commit ----
  for each leg: apply new price/remaining; recycle proceeds; update stats;
                emit fill; push ring buffer
  emit swap summary
  ft_transfer(recipient, out, output_token) .then(on_payout)
  return amount - in_used                     // unused refunded by token
```

Gas budget: payout `ft_transfer` 10 Tgas + `on_payout` 10 Tgas reserved; legs must fit in the remainder.

### 9.6 Events (NEP-297)

Format: `EVENT_JSON:{"standard":"ebbflow","version":"1.0.0","event":"<name>","data":[{...}]}`

| Event | Data fields |
|---|---|
| `market_added` | `market_id, base, quote` |
| `deposit` | `account_id, token_id, amount` |
| `withdraw` | `account_id, token_id, amount` |
| `position_created` | `position_id, owner_id, market_id, ask?, bid?` |
| `position_closed` | `position_id, owner_id, returned_base, returned_quote` |
| `fill` | `position_id, maker_id, taker_id, side, base_amount, quote_amount, new_price, recycled_amount, recycled_to` (`"bid"`/`"ask"`/`"balance"`) |
| `swap` | `taker_id, recipient, market_id, side, legs, amount_in, amount_out, refund` |
| `swap_rejected` | `taker_id, market_id, reason, amount_refunded` |
| `payout_credited` | `account_id, token_id, amount` |

### 9.7 Storage and costs

| Item | Approx. bytes | Payer |
|---|---|---|
| Balance entry | ~150 | Account via NEP-145 `storage_deposit` |
| Position (+ indexes) | ~400 | Maker via attached deposit on `create_position`; refunded on close |
| Ring buffer | fixed 100 × ~200 | Contract (pre-funded) |

Storage cost is measured with `env::storage_usage()` before/after and charged at `env::storage_byte_cost()`; excess attached NEAR is refunded.

### 9.8 Token registration prerequisites

- The book contract must be registered (`storage_deposit`) with every market token — done in deploy scripts.
- Takers must be registered with the output token; if not, payout fails and is credited internally (CON-7). The web app pre-checks and offers registration.

### 9.9 Error codes

| Code | Meaning |
|---|---|
| `E01_INVALID_MSG` | `msg` not parseable |
| `E02_WRONG_TOKEN` | Token does not match swap side / market |
| `E03_TOO_MANY_LEGS` | 0 legs or > 8 legs |
| `E04_DUPLICATE_LEG` | Position appears twice in one route |
| `E05_POSITION_NOT_FOUND` | Position closed or never existed |
| `E06_MARKET_MISMATCH` | Unknown market or position in another market |
| `E07_INSUFFICIENT_LIQUIDITY` | Side missing or leg exceeds capacity |
| `E08_INPUT_EXCEEDED` | Required input > attached amount |
| `E09_MIN_OUT_NOT_MET` | Output below `min_amount_out` |
| `E10_INSUFFICIENT_BALANCE` | Internal balance too low |
| `E11_NOT_OWNER` | Caller not position/contract owner |
| `E12_INVALID_CURVE` | Curve parameters invalid |
| `E13_PAUSED` | Contract paused for new positions/swaps |
| `E14_STORAGE` | Insufficient storage deposit |
| `E15_CROSSED_POSITION` | Bid start ≥ ask start |

Swap errors (E02–E09, E13) result in a refund + `swap_rejected` event rather than a panic. Other methods panic with the code as message.

---

## 10. Test token and deployment specification

### 10.1 Accounts

| Account | Purpose |
|---|---|
| `<team>.testnet` | Parent / owner |
| `book.<team>.testnet` | `ebbflow` contract |
| `usdc.<team>.testnet` | Test USDC (NEP-141, 6 decimals, symbol `tUSDC`) |
| `wrap.testnet` | wNEAR (existing) |
| `priya.<team>.testnet`, `arjun.<team>.testnet`, `rahul.<team>.testnet` | Demo wallets |
| `agent.<team>.testnet` | Budgeted agent account |

### 10.2 Test USDC

- Standard NEP-141 + NEP-145 + NEP-148 metadata.
- `mint(amount)` public faucet: max 10,000 tUSDC per call, per-account cooldown 1 hour (P1; unlimited acceptable for P0).

### 10.3 Deployment scripts (`scripts/`)

| Script | Does |
|---|---|
| `build.sh` | `cargo near build` for both contracts |
| `deploy.sh` | Create sub-accounts, deploy, `new`, register book with tokens, `add_market(wrap.testnet, usdc)` |
| `seed.sh` | Fund demo wallets, wrap NEAR, mint tUSDC, publish Priya's curve and Arjun's limit order |
| `fund-agent.sh` | Create `agent.<team>.testnet` with a fixed budget (e.g. 20 wNEAR + 100 tUSDC + 1 NEAR gas) |

All addresses are written to `deployments/testnet.json` and consumed by solver, MCP and web.

---

## 11. Solver API specification

### 11.1 Requirements

| ID | Requirement | Pri |
|---|---|---|
| SOL-1 | Stateless; reads positions via `get_positions` on each request (optional cache ≤ 2 s) | P0 |
| SOL-2 | Optimal split by marginal-price water-filling, capped at 8 legs | P0 |
| SOL-3 | Exact-out (base amount) for buy and sell | P0 |
| SOL-4 | Exact-in (quote amount to spend) for buy via binary search on base size | P1 |
| SOL-5 | Returns exact `ft_transfer_call` args, ready for wallet or MCP signing | P0 |
| SOL-6 | Pricing via `@ebbflow/curve-math`, identical to contract | P0 |
| SOL-7 | Slippage tolerance (default 50 bps, max 500 bps) applied to limit | P0 |
| SOL-8 | Excludes taker's own positions (optional flag) | P1 |

### 11.2 Routing algorithm

```
supply_ask(s, p):            // base available from ask side at marginal ≤ p
  if p < s.p_c: 0
  elif s.p_c == s.p_e: s.R
  else: x = min(1, ((p - s.p_c)/(s.p_e - s.p_c))^(1/k)); x * B(s)

route_buy(size Q):
  candidates = ask sides with R > 0, sorted by p_c
  binary search p* in [min p_c, max p_e] (60 iters) s.t. Σ supply_ask(s, p*) ≥ Q
  legs = positions with supply > 0 at p*
  if legs > 8: keep 8 lowest p_c, recompute p*
  allocate: curves get supply(p*-ε); limit orders at exactly p* share remainder (largest first)
  round leg base amounts to atomic units; fix residual on last leg
  for each leg: quote = curve_math.ask_cost(s, base)   // exact integer
  amount_in = Σ quote; limit_attach = ceil(amount_in * (1 + slippage))
  return route
```

Selling is symmetric with bid sides and descending prices; `min_amount_out = floor(Σ quote × (1 − slippage))`.

If total liquidity < Q → `422 INSUFFICIENT_LIQUIDITY` with available size.

### 11.3 Endpoints

**`GET /health`** → `{ ok, network, contract, block_height }`

**`GET /markets`**
```json
[{ "market_id": 0, "base": {"id":"wrap.testnet","symbol":"wNEAR","decimals":24},
   "quote": {"id":"usdc.<team>.testnet","symbol":"tUSDC","decimals":6},
   "best_bid": "4.96", "best_ask": "5.04", "positions": 2,
   "depth_base_ask": "500", "depth_quote_bid": "2000" }]
```

**`GET /markets/:id/curves?points=50`** → per-position and aggregated `(price, cumulative_base)` series for charting.

**`POST /quote`**
```json
// request
{ "market_id": 0, "side": "buy_base", "base_amount": "200",
  "slippage_bps": 50, "taker": "rahul.<team>.testnet" }
// response
{ "route_id": "q_8f2c…", "market_id": 0, "side": "buy_base",
  "legs": [
    { "position_id": "12", "maker": "priya.<team>.testnet", "base_amount": "141.42", "quote_amount": "713.70", "avg_price": "5.0467" },
    { "position_id": "31", "maker": "arjun.<team>.testnet", "base_amount": "58.58",  "quote_amount": "296.41", "avg_price": "5.06" } ],
  "amount_in": "1010.11", "amount_in_max": "1015.17", "amount_out": "200",
  "avg_price": "5.0506", "best_price": "5.04", "price_impact_bps": 21,
  "tx": { "receiver_id": "usdc.<team>.testnet", "method": "ft_transfer_call",
          "args": { "receiver_id": "book.<team>.testnet", "amount": "1015170000",
                    "msg": "{\"action\":\"swap\",\"market_id\":0,…}" },
          "gas": "150000000000000", "deposit": "1" },
  "warnings": ["taker_not_registered_with_output_token"], "block_height": 123456 }
```
Human-readable decimals are shown here for clarity; responses also include `*_raw` atomic fields.

**`POST /simulate`** `{ msg, amount }` → result of `simulate_swap` view.

Errors: `400 INVALID_REQUEST`, `404 MARKET_NOT_FOUND`, `422 INSUFFICIENT_LIQUIDITY`, `502 RPC_ERROR`.

---

## 12. MCP server specification

### 12.1 Requirements

| ID | Requirement | Pri |
|---|---|---|
| MCP-1 | Transports: stdio (local agents, Claude Code/Desktop) and streamable HTTP (hosted) | P0 / P1 |
| MCP-2 | Read tools work without keys | P0 |
| MCP-3 | `execute_swap` signs only with the agent sub-account key from env | P0 |
| MCP-4 | Per-trade cap (`MAX_TRADE_QUOTE`, `MAX_TRADE_BASE`) and daily cap (P1) enforced before signing | P0 |
| MCP-5 | `execute_swap` always simulates first and aborts on failure | P0 |
| MCP-6 | All tool outputs are structured JSON with human-readable summary text | P0 |

### 12.2 Tools

| Tool | Input | Output |
|---|---|---|
| `list_markets` | — | Markets with tokens, best bid/ask, depth |
| `get_liquidity` | `market_id`, `side?`, `levels?` | Depth at price levels; per-maker curve summaries |
| `get_quote` | `market_id`, `side`, `base_amount` \| `quote_amount`, `slippage_bps?` | Solver `/quote` response |
| `simulate_route` | `route_id` or `{msg, amount}` | `{ok, error?, amount_in, amount_out, refund}` |
| `compare_liquidity` | `market_id`, `side`, `base_amount` | Ebbflow avg price vs. a flat book at best price with the same total depth; savings in bps |
| `execute_swap` | `market_id`, `side`, `base_amount`, `slippage_bps?`, `dry_run?` | `{tx_hash, status: "filled" \| "refunded", amount_in, amount_out, refund, explorer_url}` |
| `get_agent_balance` | — | Agent wallet token balances + internal book balances |

### 12.3 Budget and key model

- Agent signs from `agent.<team>.testnet`, funded with a fixed budget; **max loss = account balance**.
- `ft_transfer_call` requires attaching 1 yoctoNEAR, which **function-call access keys cannot do**. The agent therefore holds a full-access key **to its own isolated sub-account only**; parent account keys are never exposed.
- Roadmap: a NEP-141 "agent vault" contract that accepts function-call-key calls and enforces per-trade/daily limits on-chain.

### 12.4 Configuration

```
EBBFLOW_NETWORK=testnet
EBBFLOW_CONTRACT=book.<team>.testnet
SOLVER_URL=https://…
AGENT_ACCOUNT_ID=agent.<team>.testnet
AGENT_PRIVATE_KEY=ed25519:…      # never committed
MAX_TRADE_BASE=10
MAX_TRADE_QUOTE=50
```

---

## 13. Web application specification

### 13.1 Global

| ID | Requirement | Pri |
|---|---|---|
| WEB-G1 | Wallet connect via NEAR Wallet Selector (MyNearWallet, Meteor, HERE) | P0 |
| WEB-G2 | Network badge "Testnet"; contract address and explorer links in footer | P0 |
| WEB-G3 | Registration guard: before any action, check NEP-145 registration on book and tokens; offer one-click batch registration | P0 |
| WEB-G4 | Every tx result page shows status, amounts and explorer link | P0 |
| WEB-G5 | Responsive to 375 px width; dark theme default | P1 |
| WEB-G6 | Auto-refresh positions/quotes every 5 s on visible pages | P1 |

### 13.2 Trade page

```
┌──────────────────────────────────────────────────────────────┐
│ wNEAR / tUSDC ▾       Best bid 4.96   Best ask 5.04          │
├───────────────────────────────────┬──────────────────────────┤
│  Aggregated depth (all curves)    │  [ Buy ] [ Sell ]        │
│   ▁▂▃▅▇ | ▇▅▃▂▁                   │  Amount  [ 200 ] wNEAR   │
│   per-maker colours, hover for    │  Slippage [0.5%]         │
│   maker + price + size            │  ─────────────────────   │
│                                   │  Route                   │
│                                   │   Priya 141.42 @ 5.0467  │
│                                   │   Arjun  58.58 @ 5.06    │
│                                   │  Avg 5.0506 · impact 21bp│
│                                   │  Pay ≤ 1,015.17 tUSDC    │
│                                   │  [   Execute (1 tx)   ]  │
└───────────────────────────────────┴──────────────────────────┘
```

| ID | Requirement | Pri |
|---|---|---|
| WEB-T1 | Market selector; best bid/ask header | P0 |
| WEB-T2 | Aggregated depth chart coloured per maker | P0 |
| WEB-T3 | Buy/sell toggle; base amount input; slippage control | P0 |
| WEB-T4 | Debounced quote (300 ms); route breakdown, avg price, impact, limit | P0 |
| WEB-T5 | Execute → one `ft_transfer_call`; result: **Filled** (amounts, refund) or **Refunded** (reason, Re-quote) by reading tx outcome logs | P0 |
| WEB-T6 | Highlight route legs on the depth chart | P1 |
| WEB-T7 | Exact-in input ("spend X tUSDC") | P1 |

### 13.3 Make page

```
┌──────────────────────────────────────────────────────────────┐
│ ASK (sell wNEAR)            │ BID (buy wNEAR)                 │
│ Amount   [400] wNEAR        │ Amount   [2000] tUSDC           │
│ Start    [5.04] End [5.20]  │ Start    [4.96] End [4.80]      │
│ [ ] Limit order             │ [ ] Limit order                 │
│ Alpha  0 ●──○──○──○ 3       │ Alpha  0 ○──●──○──○ 3           │
├──────────────────────────────────────────────────────────────┤
│  Curve preview: price (y) vs cumulative size (x), both sides │
│  Slice table: 25% / 50% / 75% / 100% → marginal & avg price  │
├──────────────────────────────────────────────────────────────┤
│ Deposit needed: 400 wNEAR, 2000 tUSDC · storage 0.01 NEAR    │
│ [ Publish position ]                                         │
└──────────────────────────────────────────────────────────────┘
```

| ID | Requirement | Pri |
|---|---|---|
| WEB-M1 | Inputs per side; side may be disabled | P0 |
| WEB-M2 | Alpha slider redraws curve in < 16 ms (client-side `curve-math`) | P0 |
| WEB-M3 | Limit toggle sets end = start and renders a vertical bar | P0 |
| WEB-M4 | Client-side validation mirroring §7.7 with inline messages | P0 |
| WEB-M5 | Publish uses a single wallet batch: deposits (only the shortfall vs. internal balance) + `create_position` | P0 |
| WEB-M6 | Overlay current market depth behind the preview so the maker sees where they sit | P1 |

### 13.4 Portfolio page

| ID | Requirement | Pri |
|---|---|---|
| WEB-P1 | Wallet + internal balances per token; Withdraw (amount / max) | P0 |
| WEB-P2 | Positions list: market, sides, current price, remaining, fills count | P0 |
| WEB-P3 | Per-position "recycled so far" and realised spread (from stats) | P1 |
| WEB-P4 | Close position with confirm dialog | P0 |
| WEB-P5 | Mini curve of each position showing original vs. current state | P1 |

### 13.5 Activity page

| ID | Requirement | Pri |
|---|---|---|
| WEB-A1 | Feed from `get_recent_fills`: time, taker, maker, side, size, price | P1 |
| WEB-A2 | Recycling badge on fills showing amount refilled into the opposite side | P1 |

### 13.6 Faucet page

| ID | Requirement | Pri |
|---|---|---|
| WEB-F1 | Mint tUSDC | P0 |
| WEB-F2 | Wrap NEAR → wNEAR (`near_deposit` on `wrap.testnet`) | P0 |
| WEB-F3 | Register with tokens and book | P0 |

### 13.7 Empty, loading and error states

| Situation | UI |
|---|---|
| No wallet | Read-only browsing; CTA to connect |
| No positions in market | Empty chart with "Be the first maker" CTA |
| Insufficient liquidity | Quote panel shows max available size |
| RPC/solver error | Inline banner with retry; never a blank page |
| Tx rejected in wallet | Toast; form state preserved |
| Swap refunded | Distinct amber result state with reason from `swap_rejected` |

---

## 14. NEAR Intents solver (stretch)

| ID | Requirement | Pri |
|---|---|---|
| INT-1 | Connect to the NEAR Intents solver relay on mainnet; subscribe to quote requests for supported pairs | P2 |
| INT-2 | Price requests with the same routing core against a mainnet Ebbflow deployment (or a solver-owned inventory mirroring the curve) | P2 |
| INT-3 | Settle tiny-amount swaps (≤ $5) and record tx hashes for the README | P2 |
| INT-4 | If not shipped: README section with design, sequence diagram and integration plan | P1 |

---

## 15. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-1 | Safety | No admin path to user funds; immutable curves; checked arithmetic; round against taker |
| NFR-2 | Correctness | On-chain limit enforcement; simulate-then-commit; at most one leg per position |
| NFR-3 | Gas | 8-leg swap < 100 Tgas; benchmark recorded in README |
| NFR-4 | Performance | Quote p95 < 1 s; curve preview redraw < 16 ms |
| NFR-5 | Availability | Web, solver, MCP (HTTP) hosted and live 14–18 Nov |
| NFR-6 | Observability | Solver logs request id, latency, legs, RPC errors; contract events cover every state change |
| NFR-7 | Code quality | `cargo clippy -D warnings`, `cargo fmt`; TS `strict`, ESLint; no `unwrap` on user input in contract |
| NFR-8 | Reproducibility | One-command local run (`pnpm dev`) and documented testnet deploy |
| NFR-9 | Secrets | No private keys in repo; `.env.example` only |
| NFR-10 | Accessibility | Keyboard navigable forms; colour not the only signal for buy/sell; WCAG AA contrast |

---

## 16. Security and threat model

| Threat | Vector | Mitigation |
|---|---|---|
| Admin rug | Owner drains contract | No owner method touches balances/positions; pause never blocks withdraw/close; documented in README |
| Spoofed token | Fake contract calls `ft_on_transfer` | Only accept `predecessor_account_id` ∈ registered market tokens; otherwise refund |
| Rounding drain | Many tiny fills extracting dust | Round against taker; property test that maker value never decreases |
| Overflow | Large amounts × prices | U256 intermediates, checked ops, overflow tests at 24-decimal extremes |
| Stale/malicious solver | Bad route | On-chain limit; full refund on failure |
| Reentrancy / async races | State read across callbacks | Commit all state before outgoing promises; callbacks only re-credit |
| Payout loss | Recipient unregistered | `on_payout` credits internal balance |
| Withdraw failure | Token transfer fails | `on_withdraw` restores balance |
| Front-running | Someone fills ahead of a taker | Taker's limit holds; worst case is a refund |
| Storage griefing | Spam positions | Storage paid by creator; refunded only on close |
| Agent key theft | MCP host compromised | Key only controls budgeted sub-account; per-trade caps |
| Self-cross | Maker's bid ≥ ask | `E15_CROSSED_POSITION` |

---

## 17. Test plan

### 17.1 Unit tests (Rust)

| ID | Case |
|---|---|
| TST-U1 | Ask cost, `alpha = 0`, matches closed form |
| TST-U2 | Ask cost, `alpha = 1..3` |
| TST-U3 | Bid output, `alpha = 0..3`; bid base capacity |
| TST-U4 | Limit order (`start == end`) fills at constant price for any size |
| TST-U5 | Rounding direction: cost rounds up, output rounds down |
| TST-U6 | Full consumption: `R = 0`, `p_c = p_e` |
| TST-U7 | Recycling keeps opposite `p_c` unchanged and increases `R` exactly by proceeds |
| TST-U8 | Recycling into missing side credits internal balance |
| TST-U9 | Validation errors E12, E15 |
| TST-U10 | §7.8 worked example reproduced to ±1 atomic unit |
| TST-U11 | Overflow boundaries: 10^9 wNEAR at price 10^6 USD does not overflow or panics with clear error |
| TST-U12 | `alpha = 0` path independence: 50 + 50 == 100 (±1 unit) |

### 17.2 Property tests (proptest)

| ID | Property |
|---|---|
| TST-P1 | Contract math vs. big-rational reference within 1 unit, error always in maker's favour |
| TST-P2 | Conservation: Σ internal balances + Σ position inventories + paid-out == Σ deposits, across random op sequences |
| TST-P3 | Maker value at pre-fill marginal price never decreases on a fill |
| TST-P4 | Ask marginal price monotonically non-decreasing; bid non-increasing within a side's life (except recycling, which leaves it unchanged) |

### 17.3 Integration tests (near-workspaces)

| ID | Scenario |
|---|---|
| TST-I1 | Deploy book + 2 tokens; register; add market |
| TST-I2 | Deposit → create → close → withdraw round trip; balances exact |
| TST-I3 | Single-maker buy fill; recycling visible via view |
| TST-I4 | 2-maker buy route settles; unused input refunded to taker |
| TST-I5 | Maker closes before taker swaps → full refund, state unchanged, `swap_rejected` emitted |
| TST-I6 | Insufficient attached amount → `E08`, full refund |
| TST-I7 | Sell route with `min_amount_out` too high → `E09`, full refund |
| TST-I8 | Recipient unregistered with output token → `payout_credited`, later withdrawable |
| TST-I9 | Non-owner cannot close or withdraw another's funds |
| TST-I10 | Duplicate leg → `E04`; 9 legs → `E03` |
| TST-I11 | 8-leg gas benchmark < 100 Tgas (logged) |
| TST-I12 | Fake token calling `ft_on_transfer` → refunded, no credit |
| TST-I13 | Pause blocks swaps/creates but not close/withdraw |

### 17.4 TypeScript tests

| ID | Case |
|---|---|
| TST-S1 | `curve-math` matches Rust on shared JSON fixtures (generated by a Rust test) |
| TST-S2 | Router optimality vs. brute force on books of ≤ 4 positions |
| TST-S3 | 8-leg cap respected; insufficient liquidity error |
| TST-S4 | Quote → tx args round-trip against `simulate_swap` on testnet (smoke) |
| TST-S5 | MCP `execute_swap` rejects over-cap trades and failed simulations |

### 17.5 Manual E2E

The demo script (§20.3) executed on testnet with two wallets and the agent, recorded for the video.

---

## 18. Repository structure and engineering conventions

```
ebbflow/
├── README.md                     # pitch, diagram, math, custody, run/test, addresses, video
├── PRD.md
├── contracts/
│   ├── ebbflow/                  # main contract (src/lib.rs, curve.rs, swap.rs, events.rs, storage.rs)
│   └── test-token/               # tUSDC
├── tests/integration/            # near-workspaces tests
├── packages/
│   └── curve-math/               # TS port + fixtures
├── services/
│   ├── solver/                   # REST API
│   └── mcp/                      # MCP server
├── apps/web/                     # React + Vite
├── scripts/                      # build, deploy, seed, fund-agent
├── deployments/testnet.json
└── docs/                         # architecture.png, math.md, intents-design.md
```

Conventions: pnpm workspaces; Rust stable + `cargo-near`; conventional commits; `.env.example` per service; CI (GitHub Actions) runs `cargo test`, `cargo clippy`, `pnpm test`, `pnpm build` (P1).

---

## 19. Build plan and milestones

> **Time check.** The source plan spanned 13–14 Nov. Today is **14 Nov**, the deadline is **23:59 UTC** today, and the repository is empty. Protect one end-to-end path first; cut stretch items without hesitation. Target submission by **18:00 UTC**.

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| M1 | Contract core | Curve maths (alpha 0–1 minimum, limit case), balances, deposit, create, close, withdraw, single-maker fill + recycling | TST-U1–U7, U10 green |
| M2 | Atomic routes | Swap msg, simulate-then-commit, refunds, payout callback, events, views; test token; deploy + seed scripts | TST-I1–I7 green; 2-maker route settles/refunds on testnet |
| M3 | Solver + curve-math | Router, `/quote`, `/markets`, `/curves`, `/simulate` | TST-S1–S3 green; quote matches `simulate_swap` |
| M4 | Web app | Trade, Make (visualiser), Portfolio, Faucet | Demo flow works with two testnet wallets |
| M5 | Agent access | MCP server tools + agent sub-account | Agent quotes and executes a small trade |
| M6 | Ship | README, diagram, video, X post, form, hosting | Submitted with buffer |

**Cut order if behind:** Intents → `compare_liquidity` → Activity page → alpha 2–3 → exact-in quotes → daily agent cap → CI.

**Parallelisation (if team > 1):** contract (M1–M2) ‖ curve-math + solver (M3, starting from the spec in §7) ‖ web shell + visualiser (M4, against mocked solver).

---

## 20. Submission and judging plan

### 20.1 Checklist

- [ ] Public repository with clear README (judges cannot open private repos), by 14 Nov 23:59 UTC.
- [ ] Demo post on X: says it was built at NEAR HACKATHON, tags **@NEARProtocol** and **#NEARHackathon**, includes video or screenshots.
- [ ] One form on nearhackathon.com: project name, team lead, team size, tracks, NEAR wallet address, repo link, demo post link, 20–2,000 character description.
- [ ] Hosted demo live through judging (16–18 Nov).
- [ ] Re-check rules on nearhackathon.com before submitting.

### 20.2 Form description (draft)

> Ebbflow is an order book for NEAR where each maker order is a price curve, not a single price. Makers set inventory, a price range and a shape; the curve fills progressively, so large orders pay more and makers are never emptied at one price. When one side fills, the proceeds automatically refill the other side, so a position keeps quoting both ways with no bot. A solver splits each trade across many makers and the taker signs one ft_transfer_call: every fill runs in a single receipt with an onchain limit, so the trade either completes in full or is refunded. Limit orders are a special case of the same curve. An MCP server lets AI agents quote, simulate and trade from a budgeted sub-account, and the same liquidity is designed to answer NEAR Intents swap requests from any chain. Built in Rust on NEAR testnet.

### 20.3 Two-minute demo script

| Time | Beat |
|---|---|
| 0:00–0:15 | Problem: order books need bots; AMM shapes are fixed |
| 0:15–0:35 | Priya publishes a curve; visualiser reshapes as alpha moves |
| 0:35–0:45 | Arjun posts a limit order — same code path |
| 0:45–1:05 | Rahul buys 200 wNEAR; route splits across both makers in one tx; unused input refunded |
| 1:05–1:20 | Arjun closes; Rahul retries the stale route; clean refund |
| 1:20–1:35 | Recycling: Priya's bid grew to ~2,714 tUSDC at an unchanged $4.96 |
| 1:35–1:50 | AI agent quotes and trades via MCP from its budgeted sub-account |
| 1:50–2:00 | Roadmap: Intents solver, vault sub-accounts, mainnet audit |

### 20.4 Judging criteria mapping

| Criterion | Evidence in repo / demo |
|---|---|
| Technical implementation | Exact integer curve maths with property tests; single-receipt settlement; refund paths tested; gas benchmark |
| Design | Curve visualiser understandable in 5 s; one-click quote and execute; clear refund state |
| Impact | Small makers earn spread without bots; agents and Intents users get deeper, shaped liquidity |
| Originality | Curve-shaped orders with recycling, new on NEAR; one code path for curves and limits |
| Sustainability | Roadmap (§22) with concrete next steps |

### 20.5 README outline (written for AI judges too)

1. Pitch + 20-second GIF of the visualiser
2. How it works (three mechanics) + architecture diagram
3. Curve maths with formulas, rounding policy and worked example
4. Atomicity on NEAR: why single-receipt, swap msg format, refund semantics
5. Custody model and honest trade-off (no approve/transferFrom) + vault roadmap
6. Agent access: MCP tools, budget model, key-model caveat
7. Deployed addresses (testnet) and live links
8. Run locally / run tests (exact commands) / gas benchmark results
9. Known limitations (path dependence for alpha > 0, exhausted-side behaviour, testnet-only)
10. Roadmap

---

## 21. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rounding bugs in curve maths | Med | High | U256, round against taker, property tests vs. reference model |
| TS/Rust maths drift | Med | High | Shared fixtures generated from Rust; solver verifies with `simulate_swap` |
| Gas limits on long routes | Low | Med | `MAX_LEGS = 8`; benchmark test |
| Wallet batch tx UX issues | Med | Med | Fall back to sequential txs with progress UI |
| Testnet RPC instability | Med | Med | Configurable RPC list with failover; short cache |
| Custody perception | Med | Med | README: segregated balances, maker-only withdraw, no admin key; vault roadmap |
| NEAR Intents mainnet-only | High | Low | Core judged on testnet; Intents as design or tiny-amount demo |
| Time (< 1 day left) | High | High | Strict milestone order and cut list; submit by 18:00 UTC |

---

## 22. Roadmap (post-hackathon)

| Phase | Item |
|---|---|
| Next | NEAR Intents solver live on mainnet; mainnet deployment behind caps |
| Next | Per-maker vault sub-accounts (e.g. `book.priya.near`) with reserve-then-commit across vaults for full self-custody |
| Next | On-chain agent vault with per-trade/daily limits callable by function-call keys |
| Later | Autonomous market-making agent on NEAR AI Cloud |
| Later | Chain Signatures so makers can quote assets held on other chains |
| Later | Fractional alpha / arbitrary piecewise curves; maker fee tiers |
| Later | Indexer + historical analytics; audit |

---

## 23. Open questions and decisions log

### 23.1 Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| Q1 | Team account names (`<team>.testnet`), team lead, team size | Team | Deploy (M2) |
| Q2 | Hosting for web, solver, MCP HTTP through 18 Nov (e.g. Vercel + Railway/Fly) | Team | M6 |
| Q3 | Keep an owner pause key, or make the contract fully ownerless after market setup? | Team | M2 |
| Q4 | Attempt Intents at all, or README design only? | Team | After M5 |

### 23.2 Decisions (proposed defaults)

| # | Decision | Default |
|---|---|---|
| D1 | Alpha domain | Integers 0–3 |
| D2 | Leg denomination | Base amount |
| D3 | Rejection mechanism | Simulate-then-commit with refund + event (no panic) |
| D4 | Recycling into a missing side | Credit maker's internal balance |
| D5 | Max legs | 8 |
| D6 | Price scale | Quote atomic per whole base × 10^12 |
| D7 | Activity source | On-chain ring buffer (100) |
| D8 | Agent key model | Full-access key on isolated sub-account only |

---

## 24. Glossary

| Term | Meaning |
|---|---|
| **Base / quote** | The traded asset (wNEAR) / the pricing asset (tUSDC) |
| **Ask side / bid side** | The part of a position that sells base / buys base |
| **Alpha** | Shape parameter; higher = more liquidity near the current price |
| **Marginal price (`p_c`)** | Price of the next infinitesimal unit on a side |
| **Recycling** | Proceeds from one side added to the opposite side at its current price |
| **Leg** | One position's part of a route |
| **Route** | Set of legs settling in one swap |
| **Single receipt** | One NEAR contract execution; all state changes are atomic within it |
| **`ft_transfer_call`** | NEP-141 transfer that invokes `ft_on_transfer` on the receiver and refunds whatever it returns as unused |
| **NEP-141 / NEP-145 / NEP-297** | Fungible token / storage management / event standards |
| **MCP** | Model Context Protocol — tool interface for AI agents |
| **NEAR Intents** | NEAR's cross-chain intent settlement layer where solvers fill user swap requests |
