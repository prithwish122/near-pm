# Ebbflow MCP server

Lets AI agents discover liquidity, quote, simulate and trade on the Ebbflow book.

| Tool | What it does |
|---|---|
| `list_markets` | Markets with best bid/ask, positions and depth |
| `get_liquidity` | Per-maker curves (curve vs limit) and cumulative depth by price |
| `get_quote` | Best route across up to 8 makers, with the exact `ft_transfer_call` to sign |
| `simulate_route` | Quote + dry run against the contract's `simulate_swap` view |
| `compare_liquidity` | Multi-maker route vs the single best maker for the same size |
| `execute_swap` | Checks limits, simulates, then signs and sends from the agent account (`dry_run` supported) |
| `get_agent_balance` | NEAR, wallet and in-book token balances, remaining daily limit |

## Budget model

The agent signs only from its own sub-account (e.g. `you-agent.testnet`), funded with a fixed amount: **its maximum loss is that balance**. `ft_transfer_call` must attach 1 yoctoNEAR, which function-call access keys cannot do, so the agent holds a full-access key to that isolated account only — never to your main account. On top of that, `execute_swap` enforces `MAX_TRADE_BASE`, `MAX_TRADE_QUOTE` and `MAX_DAILY_QUOTE`, always simulates first, and the contract enforces the price limit on-chain.

## Setup

```bash
# from the repo root
pnpm install && pnpm build

# create and fund an agent account (key saved to ~/.near-credentials)
near account create-account sponsor-by-faucet-service you-agent.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near contract call-function as-transaction usdc.ebbflow-team.testnet mint json-args '{"amount":"30000000"}' \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as you-agent.testnet network-config testnet sign-with-legacy-keychain send

# scripted agent run: list → liquidity → quote → compare → simulate → execute → balance
AGENT_ACCOUNT_ID=you-agent.testnet pnpm --filter @ebbflow/mcp demo 0.5
```

### Claude Code

```bash
claude mcp add ebbflow -e AGENT_ACCOUNT_ID=you-agent.testnet -- node /path/to/repo/services/mcp/dist/index.js
```

Then ask: *"Using ebbflow, how deep is the wNEAR book? Buy 0.5 wNEAR if the average price is under 5.10."*

### HTTP

`node dist/index.js --http` serves streamable HTTP at `http://localhost:8788/mcp` (stateless, JSON responses) and `/health`.
