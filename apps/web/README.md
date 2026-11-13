# Ebbflow web app

Landing page plus the app: **Trade**, **Make**, **Portfolio**, **Activity** and **Faucet**.
Next.js 14, TypeScript, Tailwind, NEAR Wallet Selector (MyNearWallet, Meteor, HERE).

## Run

```bash
pnpm install
pnpm solver        # terminal 1: quote API on :8787 (reads the testnet book over RPC)
pnpm web           # terminal 2: http://localhost:3100
```

Config is read from `deployments/testnet.json` (book and market). Optional env, see `.env.example`:
`NEXT_PUBLIC_SOLVER_URL`, `NEXT_PUBLIC_NEAR_RPC_URLS`.

## Pages

| Route | What it does |
|---|---|
| `/trade` | Per-maker depth chart, debounced solver quote, buy/sell, exact-in for buys, slippage. One `ft_transfer_call`. Result shown as Filled or Refunded. |
| `/make` | Ask/bid curve inputs, alpha slider, limit toggle, live preview and slice table. Two steps: deposit (and register), then publish. |
| `/portfolio` | Wallet and book balances, withdraw, positions with fills and realised spread, close. |
| `/activity` | Recent fills from the on-chain ring buffer, with recycling badges. |
| `/faucet` | Mint tUSDC, wrap NEAR, NEP-145 registration. |

## Notes

- Quotes come from the solver; the contract enforces the limit, so a stale quote can only cause a refund.
- Deposits settle over a few blocks, so *Make* publishes in a separate step instead of batching.
- Browser wallets redirect away and back; the result is read from `transactionHashes` in the URL.
- Wallet signing is not covered by automated tests (it needs a real wallet). Transaction builders and the outcome parser are unit-tested: `pnpm --filter @ebbflow/web test`.

The landing page (`/`) uses a floating-point *demo* of the curve maths for its hero widget; the app pages use the real solver and contract.
