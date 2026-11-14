import Link from "next/link";
import { BOOK, MARKET, OWNER } from "@/lib/config";
import { avg, fb, fp, fq, route } from "@/lib/docs/calc";
import { A, C, Callout, CodeBlock, H2, H3, Lead, P, Table, UL } from "../ui";

const REPO = "https://github.com/prithwish122/near-pm";

export function ContractApi() {
  return (
    <>
      <Lead>
        The book contract is <C>{BOOK}</C> (Rust, near-sdk 5). All amounts are <C>U128</C> decimal strings, position ids are <C>U64</C>{" "}
        strings, and prices use the 10¹² scale described in <Link className="text-mint" href="/docs/units-and-precision">Units &amp; precision</Link>.
      </Lead>

      <H2>Change methods</H2>
      <Table
        head={["Method", "Arguments", "Deposit", "Gas", "Returns"]}
        rows={[
          [<C key="1">storage_deposit</C>, "account_id?, registration_only?", "≥ 0.01 NEAR", "30 Tgas", "StorageBalance"],
          [<C key="2">create_position</C>, "market_id, ask?: SideInput, bid?: SideInput", "0.01 NEAR (excess refunded)", "30 Tgas", "position id (U64)"],
          [<C key="3">close_position</C>, "position_id", "1 yocto", "30 Tgas", "—"],
          [<C key="4">withdraw</C>, "token_id, amount? (null = all)", "1 yocto", "100 Tgas", "Promise"],
          [<C key="5">ft_on_transfer</C>, "sender_id, amount, msg", "—", "—", "unused amount (U128)"],
          [<C key="6">add_market</C>, "base, quote, base_decimals, quote_decimals", "owner only", "30 Tgas", "market id (u32)"],
          [<C key="7">set_paused</C>, "paused: bool", "owner only", "30 Tgas", "—"],
        ]}
      />
      <P>
        <C>ft_on_transfer</C> is called by token contracts, never directly. You reach it with <C>ft_transfer_call</C> on the token (1 yocto
        attached; 60 Tgas for deposits, 150 Tgas for swaps). <C>on_payout</C> and <C>on_withdraw</C> are private callbacks.
      </P>

      <H3>SideInput</H3>
      <CodeBlock lang="ts" code={`interface SideInput {
  amount: string;       // ask: base atoms to sell; bid: quote atoms to spend
  start_price: string;  // scaled price of the first unit
  end_price: string;    // scaled price of the last unit (ask: ≥ start, bid: ≤ start)
  alpha: 0 | 1 | 2 | 3; // shape; k = alpha + 1
}`} />

      <H3>Transfer messages</H3>
      <CodeBlock lang="json" title="msg for ft_transfer_call" code={`{"action":"deposit"}

{"action":"swap","market_id":0,"side":"buy_base",
 "legs":[{"position_id":"0","base_amount":"141421356237309504880168"}],
 "min_amount_out":"141421356237309504880168","recipient":null}`} />

      <H2>View methods</H2>
      <Table
        head={["Method", "Arguments", "Returns"]}
        rows={[
          [<C key="1">get_config</C>, "—", "owner_id, max_legs (8), price_scale (10¹²), paused, version"],
          [<C key="2">get_markets</C>, "—", "Market[]: base, quote, base_decimals, quote_decimals"],
          [<C key="3">get_positions</C>, "market_id, from_index?, limit?", "PositionView[]"],
          [<C key="4">get_position</C>, "position_id", "PositionView | null"],
          [<C key="5">get_positions_by_owner</C>, "account_id", "PositionView[]"],
          [<C key="6">get_balance</C>, "account_id, token_id", "U128 book balance"],
          [<C key="7">quote_leg</C>, "position_id, side, base_amount", "{ ok, error, quote_amount, new_price }"],
          [<C key="8">simulate_swap</C>, "msg: SwapMsg, amount", "{ ok, error, legs[], amount_in_used, amount_out, refund }"],
          [<C key="9">get_recent_fills</C>, "limit? (≤ 100)", "FillRecord[], newest first"],
          [<C key="10">storage_balance_of</C>, "account_id", "StorageBalance | null"],
          [<C key="11">storage_balance_bounds</C>, "—", "{ min: 0.01 NEAR, max }"],
        ]}
      />

      <H3>PositionView</H3>
      <CodeBlock lang="ts" code={`interface PositionView {
  position_id: string;
  owner_id: string;
  market_id: number;
  ask: Side | null;   // { remaining, start_price, current_price, end_price, alpha }
  bid: Side | null;
  bid_base_capacity: string;
  stats: { base_sold: string; quote_received: string; base_bought: string; quote_spent: string; fills: number };
  created_at_ms: number;
}`} />

      <H3>FillRecord</H3>
      <CodeBlock lang="ts" code={`interface FillRecord {
  position_id: string; maker_id: string; taker_id: string; market_id: number;
  side: "buy_base" | "sell_base";
  base_amount: string; quote_amount: string; new_price: string;
  recycled_amount: string; recycled_to: "bid" | "ask" | "balance";
  timestamp_ms: number;
}`} />

      <H2>Limits</H2>
      <Table
        head={["Constant", "Value"]}
        align={["l", "r"]}
        rows={[
          ["MAX_LEGS", "8"],
          ["FILL_HISTORY (ring buffer)", "100 fills"],
          ["STORAGE_MIN (registration)", "0.01 NEAR"],
          ["POSITION_STORAGE", "0.01 NEAR"],
          ["Payout / withdraw transfer gas", "10 Tgas + 10 Tgas callback"],
          ["MAX_ALPHA", "3"],
        ]}
      />
      <P>Source: <A href={`${REPO}/tree/main/contracts/ebbflow/src`}>contracts/ebbflow/src</A>.</P>
    </>
  );
}

export function Events() {
  const fill = {
    standard: "ebbflow",
    version: "1.0.0",
    event: "fill",
    data: [{
      position_id: "1", maker_id: "arjun.testnet", taker_id: "rahul.testnet", market_id: 0, side: "buy_base",
      base_amount: route.arjunBase.toString(), quote_amount: route.arjun.quote.toString(), new_price: route.arjun.new_price.toString(),
      recycled_amount: route.arjun.quote.toString(), recycled_to: "balance", timestamp_ms: 1763130000000,
    }],
  };
  return (
    <>
      <Lead>
        The book emits <A href="https://nomicon.io/Standards/EventsFormat">NEP-297</A> events as log lines prefixed with <C>EVENT_JSON:</C>, with{" "}
        <C>standard: &quot;ebbflow&quot;</C> and <C>version: &quot;1.0.0&quot;</C>. Indexers and the web app read fills and results from these.
      </Lead>

      <H2>Event list</H2>
      <Table
        head={["Event", "When", "Data"]}
        rows={[
          [<C key="1">market_added</C>, "add_market", "market_id, base, quote"],
          [<C key="2">deposit</C>, "Deposit credited", "account_id, token_id, amount"],
          [<C key="3">withdraw</C>, "Withdrawal sent", "account_id, token_id, amount"],
          [<C key="4">position_created</C>, "create_position", "Full PositionView"],
          [<C key="5">position_closed</C>, "close_position", "position_id, owner_id, returned_base, returned_quote"],
          [<C key="6">fill</C>, "Each leg of a swap", "FillRecord"],
          [<C key="7">swap</C>, "Once per successful swap", "taker_id, recipient, market_id, side, legs, amount_in, amount_out, refund"],
          [<C key="8">swap_rejected</C>, "Swap failed validation", "taker_id, market_id, reason, amount_refunded"],
          [<C key="9">payout_credited</C>, "Output transfer failed; credited", "account_id, token_id, amount"],
        ]}
      />

      <H2>Example: a fill</H2>
      <P>Arjun&apos;s leg of the 200 wNEAR route. He has no bid, so the quote proceeds go to his book balance:</P>
      <CodeBlock lang="text" title="log line" code={`EVENT_JSON:${JSON.stringify(fill)}`} />

      <H2>Example: a swap</H2>
      <CodeBlock
        lang="json"
        code={JSON.stringify({
          standard: "ebbflow", version: "1.0.0", event: "swap",
          data: [{
            taker_id: "rahul.testnet", recipient: "rahul.testnet", market_id: 0, side: "buy_base", legs: ["…two FillRecords…"],
            amount_in: route.total.toString(), amount_out: route.size.toString(), refund: (route.amountInMax - route.total).toString(),
          }],
        }, null, 2)}
      />

      <H2>Parsing</H2>
      <CodeBlock lang="ts" code={`for (const r of outcome.receipts_outcome)
  for (const log of r.outcome.logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    const e = JSON.parse(log.slice(11));
    if (e.standard === "ebbflow") for (const d of e.data) handle(e.event, d);
  }`} />
    </>
  );
}

const ERRORS: [string, string, string][] = [
  ["E01_INVALID_MSG", "ft_transfer_call msg is not a valid deposit or swap message", "Send {\"action\":\"deposit\"} or a full swap message. Funds are refunded."],
  ["E02_WRONG_TOKEN", "Input token doesn't match the swap side, or isn't a market token", "Buys send the quote token, sells send the base token."],
  ["E03_TOO_MANY_LEGS", "0 legs or more than 8", "Split the trade, or let the solver route it."],
  ["E04_DUPLICATE_LEG", "Same position appears twice in a route", "Merge the legs into one."],
  ["E05_POSITION_NOT_FOUND", "Position closed or never existed", "Re-quote; the route went stale."],
  ["E06_MARKET_MISMATCH", "Unknown market, or position from another market", "Check market_id and the position ids."],
  ["E07_INSUFFICIENT_LIQUIDITY", "Leg larger than the side's remaining, side missing, or zero size", "Re-quote against current state."],
  ["E08_INPUT_EXCEEDED", "Legs cost more than the attached amount", "Price moved past your slippage; re-quote or raise slippage."],
  ["E09_MIN_OUT_NOT_MET", "Output below min_amount_out, or zero", "Price moved past your slippage; re-quote."],
  ["E10_INSUFFICIENT_BALANCE", "Book balance too low for a withdrawal or position", "Deposit more or reduce the amount."],
  ["E11_NOT_OWNER", "Closing someone else's position, or an owner-only method", "Use the owning account."],
  ["E12_INVALID_CURVE", "Zero amount or price, alpha > 3, wrong price order, or neither side given", "Asks: start ≤ end. Bids: start ≥ end."],
  ["E13_PAUSED", "Trading paused by the owner", "Wait. Withdrawals and closes still work."],
  ["E14_STORAGE", "Not registered, or less than 0.01 NEAR attached for a position", "Call storage_deposit, or attach 0.01 NEAR."],
  ["E15_CROSSED_POSITION", "Bid start price ≥ ask start price", "Start the bid below the ask."],
  ["E16_MATH_OVERFLOW", "Amounts too large for u128 after the maths", "Use smaller amounts."],
];

export function Errors() {
  return (
    <>
      <Lead>
        Errors are short stable codes. Swap validation failures are returned as a <C>swap_rejected</C> event with a full refund; other methods
        panic with <C>Smart contract panicked: E…</C>, which reverts the call.
      </Lead>
      <Table head={["Code", "Cause", "Fix"]} rows={ERRORS.map(([c, cause, fix]) => [<C key={c}>{c}</C>, cause, fix])} />
      <Callout type="note" title="Where you'll see them">
        <p>
          In <C>swap_rejected.reason</C>, in the failure message of a reverted call, in <C>quote_leg</C>/<C>simulate_swap</C> as <C>error</C>, and
          as plain-language messages on the web app&apos;s result screen.
        </p>
      </Callout>
    </>
  );
}

export function SolverApi() {
  const r = route;
  const quote = {
    market_id: 0,
    side: "buy_base",
    legs: [
      { position_id: "0", maker: "priya.testnet", base_amount: fb(r.priyaBase), quote_amount: fq(r.priya.quote), avg_price: fp(avg(r.priyaBase, r.priya.quote)), new_price: fp(r.priya.new_price) },
      { position_id: "1", maker: "arjun.testnet", base_amount: fb(r.arjunBase), quote_amount: fq(r.arjun.quote), avg_price: "5.06", new_price: "5.06" },
    ],
    amount_in: fq(r.total),
    amount_in_max: fq(r.amountInMax),
    amount_out: "200",
    min_amount_out: "200",
    avg_price: fp(r.avgP),
    best_price: fp(r.best),
    price_impact_bps: r.impactBps,
    slippage_bps: 50,
    msg: { market_id: 0, side: "buy_base", legs: "[…]", min_amount_out: r.size.toString() },
    tx: { receiver_id: MARKET.quote, method_name: "ft_transfer_call", args: { receiver_id: BOOK, amount: r.amountInMax.toString(), msg: "…" }, gas: "150000000000000", deposit: "1" },
    warnings: [],
  };
  return (
    <>
      <Lead>
        The solver is a stateless HTTP service (Hono, Node) that reads the book over NEAR RPC with a 2-second cache. It never holds keys or
        funds. Run it with <C>pnpm solver</C> (port 8787).
      </Lead>

      <H2>Endpoints</H2>
      <Table
        head={["Method", "Path", "Purpose"]}
        rows={[
          ["GET", <C key="1">/health</C>, "RPC status, network, contract, block height"],
          ["GET", <C key="2">/markets</C>, "Markets with best bid/ask, position count and depth"],
          ["GET", <C key="3">/markets/:id/positions</C>, "Raw positions from the contract"],
          ["GET", <C key="4">/markets/:id/curves?points=50</C>, "Sampled price curves per position, for charts (2–200 points)"],
          ["POST", <C key="5">/quote</C>, "Route a trade and return a signable transaction"],
          ["POST", <C key="6">/simulate</C>, "Run a swap message through the contract's simulate_swap"],
          ["GET", <C key="7">/intents/tokens</C>, "1Click assets (see NEAR Intents)"],
          ["POST", <C key="8">/intents/swap-quote</C>, "Cross-chain funding quote"],
          ["GET", <C key="9">/intents/status?deposit_address=</C>, "Funding status"],
        ]}
      />

      <H2>POST /quote</H2>
      <Table
        head={["Field", "Type", "Notes"]}
        rows={[
          [<C key="1">market_id</C>, "number", "Required"],
          [<C key="2">side</C>, `"buy_base" | "sell_base"`, "Required"],
          [<C key="3">base_amount</C>, "string", "Whole tokens, e.g. \"200\". Or base_amount_raw in atoms."],
          [<C key="4">quote_amount</C>, "string", "Buys only: spend at most this. Or quote_amount_raw."],
          [<C key="5">slippage_bps</C>, "0–500", "Default 50"],
          [<C key="6">taker</C>, "account", "Used to skip your own positions and check registration"],
          [<C key="7">recipient</C>, "account", "Output receiver, defaults to the taker"],
          [<C key="8">exclude_own</C>, "boolean", "Default true"],
        ]}
      />
      <P>Exactly one of the four amount fields is required.</P>
      <CodeBlock code={`curl -s -X POST http://localhost:8787/quote -H 'content-type: application/json' \\
  -d '{"market_id":0,"side":"buy_base","base_amount":"200","taker":"rahul.testnet"}'`} />
      <CodeBlock lang="json" title="response (reference book)" code={JSON.stringify(quote, null, 2)} />
      <P>
        Sign <C>tx</C> as-is: it is the <C>ft_transfer_call</C> with the swap message already encoded. <C>warnings</C> may contain{" "}
        <C>recipient_not_registered_with_output_token</C>, in which case the output will be credited to the book balance instead.
      </P>

      <H2>Errors</H2>
      <Table
        head={["HTTP", "error", "When"]}
        rows={[
          ["400", <C key="1">INVALID_REQUEST</C>, "Body fails validation; message lists the fields"],
          ["404", <C key="2">MARKET_NOT_FOUND</C>, "Unknown market_id"],
          ["422", <C key="3">INSUFFICIENT_LIQUIDITY</C>, "Book can't fill the size; available_raw says how much it can"],
          ["422", <C key="4">ROUTE_FAILED</C>, "Curve maths rejected a leg"],
          ["502", <C key="5">RPC_ERROR</C>, "All RPC endpoints failed"],
        ]}
      />

      <H2>Configuration</H2>
      <Table
        head={["Variable", "Default"]}
        rows={[
          [<C key="1">PORT</C>, "8787"],
          [<C key="2">NEAR_NETWORK</C>, "testnet"],
          [<C key="3">EBBFLOW_CONTRACT</C>, "from deployments/<network>.json"],
          [<C key="4">NEAR_RPC_URLS</C>, "https://test.rpc.fastnear.com, https://rpc.testnet.near.org (failover in order)"],
          [<C key="5">CACHE_TTL_SECONDS</C>, "2"],
        ]}
      />
    </>
  );
}

export function Mcp() {
  return (
    <>
      <Lead>
        The MCP server lets any MCP client (Claude Code, Claude Desktop, agent frameworks) read the book and trade on it. Read tools need no keys;
        trading signs from a dedicated agent account under hard budget caps.
      </Lead>

      <H2>Tools</H2>
      <Table
        head={["Tool", "Kind", "What it does"]}
        rows={[
          [<C key="1">list_markets</C>, "read", "Markets with best bid/ask, positions and depth"],
          [<C key="2">get_liquidity</C>, "read", "Per-maker curves and cumulative depth by price level"],
          [<C key="3">get_quote</C>, "read", "Best route, average price, impact, limits and the transaction to sign"],
          [<C key="4">simulate_route</C>, "read", "Quote, then dry-run against simulate_swap"],
          [<C key="5">compare_liquidity</C>, "read", "Multi-maker route vs the single best maker"],
          [<C key="6">execute_swap</C>, "write", "Quote → check caps → simulate → sign and send. dry_run stops before sending"],
          [<C key="7">get_agent_balance</C>, "read", "NEAR, wallet and book balances, and remaining limits"],
          [<C key="8">intents_tokens</C>, "read", "Cross-chain assets 1Click can deliver (mainnet)"],
          [<C key="9">intents_fund_quote</C>, "read", "Dry-run funding quote to the agent's account"],
        ]}
      />

      <H2>Safety model</H2>
      <UL>
        <li><strong className="text-white">Isolated account.</strong> The agent signs only from its own sub-account. Its maximum loss is that account&apos;s balance, by construction.</li>
        <li><strong className="text-white">Caps before signing.</strong> Per-trade base and quote caps and a rolling daily quote cap are checked before any transaction is built.</li>
        <li><strong className="text-white">Simulate first.</strong> <C>execute_swap</C> always runs <C>simulate_swap</C> and aborts if it fails.</li>
        <li><strong className="text-white">Atomic settlement.</strong> The swap itself is all-or-nothing, like any other Ebbflow trade.</li>
      </UL>

      <H2>Configuration</H2>
      <Table
        head={["Variable", "Default", "Meaning"]}
        rows={[
          [<C key="1">AGENT_ACCOUNT_ID</C>, "—", "Trading account. Omit for read-only."],
          [<C key="2">AGENT_PRIVATE_KEY</C>, "—", "Or a key in ~/.near-credentials/<network>/<account>.json"],
          [<C key="3">MAX_TRADE_BASE</C>, "10", "Max base per trade (whole tokens)"],
          [<C key="4">MAX_TRADE_QUOTE</C>, "50", "Max quote per trade"],
          [<C key="5">MAX_DAILY_QUOTE</C>, "200", "Max quote per rolling day"],
          [<C key="6">NEAR_NETWORK</C>, "testnet", ""],
          [<C key="7">EBBFLOW_CONTRACT</C>, "from deployments", ""],
          [<C key="8">PORT</C>, "8788", "For --http"],
        ]}
      />

      <H2>Connect a client</H2>
      <CodeBlock title="Claude Code" code={`pnpm --filter @ebbflow/mcp build
claude mcp add ebbflow -e AGENT_ACCOUNT_ID=you-agent.testnet -- node /path/to/repo/services/mcp/dist/index.js`} />
      <CodeBlock lang="json" title="Claude Desktop · claude_desktop_config.json" code={`{
  "mcpServers": {
    "ebbflow": {
      "command": "node",
      "args": ["/path/to/repo/services/mcp/dist/index.js"],
      "env": { "AGENT_ACCOUNT_ID": "you-agent.testnet", "MAX_TRADE_QUOTE": "50" }
    }
  }
}`} />
      <CodeBlock title="HTTP transport" code={`node services/mcp/dist/index.js --http   # streamable HTTP at http://localhost:8788/mcp`} />

      <H2>Example session</H2>
      <P>Prompt: <em>&quot;Using ebbflow, how deep is the wNEAR book? Buy 0.5 wNEAR if the average price is under 5.10.&quot;</em> The agent calls:</P>
      <CodeBlock lang="text" title="tool calls (illustrative output)" code={`list_markets      → 1 market, best ask 5.04, best bid 4.96
get_quote         → pay 2.52 tUSDC, receive 0.5 wNEAR at avg 5.04, 1 maker, impact 0 bps
simulate_route    → Simulation OK.
execute_swap      → Filled: paid 2.52…, received 0.5. https://testnet.nearblocks.io/txns/…
get_agent_balance → remaining daily limit 197.48 tUSDC`} />
      <P>Run the scripted version with <C>pnpm --filter @ebbflow/mcp demo 0.5</C>.</P>
    </>
  );
}

export function Intents() {
  return (
    <>
      <Lead>
        NEAR Intents lets users and solvers swap across chains through a shared verifier contract. Ebbflow uses it in two ways: funding an account
        from any chain (1Click), and quoting intents with Ebbflow liquidity as a market maker.
      </Lead>
      <Callout type="warn" title="Mainnet only">
        <p>
          NEAR Intents runs on mainnet, so none of this works against the testnet book. The code is covered by offline tests (mock relay, mock
          1Click, fake chain) and has not yet been run against the live relay.
        </p>
      </Callout>

      <H2>1Click funding</H2>
      <P>
        The <Link className="text-mint" href="/fund">Fund</Link> page lets a user pick an asset on another chain, get a quote, send to a deposit
        address, and watch the status until the tokens arrive in their NEAR account, ready to trade.
      </P>
      <Table
        head={["Endpoint / tool", "Purpose"]}
        rows={[
          [<C key="1">GET /intents/tokens</C>, "Supported assets with chain and asset id"],
          [<C key="2">POST /intents/swap-quote</C>, "origin_asset, destination_asset, amount, refund_to, slippage → quote and deposit address"],
          [<C key="3">GET /intents/status</C>, "Status of a deposit address"],
          [<C key="4">intents_tokens, intents_fund_quote</C>, "The same for agents over MCP (dry-run quotes)"],
        ]}
      />
      <P>The 1Click API key (<C>INTENTS_API_KEY</C>) stays on the solver; quotes are dry by default.</P>

      <H2>Intents market-maker solver</H2>
      <P>
        <C>pnpm intents</C> connects to the solver relay, prices incoming quote requests for the book&apos;s tokens by routing them across Ebbflow
        curves plus a margin (<C>INTENTS_MARGIN_BPS</C>, default 30), and answers with a NEP-413 signed <C>token_diff</C> intent.
      </P>
      <Table
        head={["Request", "Handling"]}
        rows={[
          ["Pay quote, exact in", "Spend input minus margin on the book"],
          ["Pay quote, exact out", "Exact-size buy route plus margin"],
          ["Pay base, exact in", "Exact-size sell route minus margin"],
          ["Pay base, exact out", "Declined"],
          ["Unknown pair, no liquidity, above INTENTS_MAX_QUOTE_RAW, or not enough inventory", "Declined"],
        ]}
      />
      <P>
        A hedger compares the solver&apos;s <C>intents.near</C> balances with a baseline after each settlement (and every 30 s) and closes the
        gap on the Ebbflow book. Margin earned stays in inventory.
      </P>
      <CodeBlock code={`export EBBFLOW_CONTRACT=<mainnet book> NEAR_NETWORK=mainnet
export INTENTS_SOLVER_ACCOUNT=solver.near INTENTS_SOLVER_KEY=ed25519:...
pnpm intents setup                 # once: register key and token storage
pnpm intents                       # dry run: logs the quotes it would send
INTENTS_RESPOND=1 pnpm intents     # sign, respond and hedge`} />
    </>
  );
}

export function Deployments() {
  return (
    <>
      <Lead>Live addresses for the testnet deployment and what every call costs.</Lead>

      <H2>Testnet</H2>
      <Table
        head={["Role", "Account"]}
        rows={[
          ["Book contract", <A key="1" href={`https://testnet.nearblocks.io/address/${BOOK}`}>{BOOK}</A>],
          ["Owner", <C key="2">{OWNER}</C>],
          ["Base token (wNEAR, 24 dec)", <C key="3">{MARKET.base}</C>],
          ["Quote token (tUSDC, 6 dec)", <C key="4">{MARKET.quote}</C>],
          ["Market id", "0"],
        ]}
      />
      <P>tUSDC is an open test token: <C>mint(amount)</C> mints up to 10,000 tUSDC per call to the caller.</P>

      <H2>Storage deposits</H2>
      <Table
        head={["What", "Amount", "Refund"]}
        align={["l", "r", "l"]}
        rows={[
          ["Book registration", "0.01 NEAR", "—"],
          ["Each position", "0.01 NEAR", "On close_position"],
          ["wNEAR registration", "0.00125 NEAR", "—"],
          ["tUSDC registration", "0.00125 NEAR", "—"],
        ]}
      />

      <H2>Gas</H2>
      <Table
        head={["Call", "Prepaid gas", "Attached"]}
        align={["l", "r", "r"]}
        rows={[
          ["Swap (ft_transfer_call)", "150 Tgas", "1 yocto"],
          ["Deposit (ft_transfer_call)", "60 Tgas", "1 yocto"],
          ["create_position", "30 Tgas", "0.01 NEAR"],
          ["close_position", "30 Tgas", "1 yocto"],
          ["withdraw", "100 Tgas", "1 yocto"],
          ["storage_deposit, mint, near_deposit", "30 Tgas", "varies"],
        ]}
      />
      <P>Unused gas is refunded. At the protocol minimum gas price, 150 Tgas costs at most 0.015 NEAR.</P>

      <H2>Deploy your own</H2>
      <CodeBlock code={`./scripts/build.sh                                  # builds res/ebbflow.wasm and res/test_token.wasm
MASTER_ACCOUNT=you.testnet ./scripts/deploy.sh      # book, test token, market 0 → deployments/testnet.json
./scripts/seed.sh                                   # demo makers and a funded taker
CONFIRM=yes ./scripts/deploy-mainnet.sh             # mainnet → deployments/mainnet.json`} />
    </>
  );
}
