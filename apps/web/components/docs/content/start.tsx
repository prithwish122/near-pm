import Link from "next/link";
import { BOOK, MARKET, NETWORK, OWNER } from "@/lib/config";
import { avg, fb, fq, fp, route } from "@/lib/docs/calc";
import { A, C, Callout, CodeBlock, Flow, H2, H3, Lead, P, Stats, Step, Steps, Table, UL } from "../ui";

export function Introduction() {
  return (
    <>
      <Lead>
        Ebbflow is an on-chain market on NEAR where a maker&apos;s order is a <strong className="text-white">curve</strong>, not a single price.
        Takers trade against many curves at once, and every multi-maker fill settles atomically in one transaction.
      </Lead>
      <Stats
        items={[
          { label: "Makers per swap", value: "up to 8", sub: "one leg per position" },
          { label: "Transactions", value: "1", sub: "ft_transfer_call" },
          { label: "Partial fills", value: "0", sub: "all legs or full refund" },
          { label: "Shapes", value: "α 0–3", sub: "integer exponents, exact maths" },
        ]}
      />

      <H2>The problem</H2>
      <P>
        On an order book a maker posts discrete orders: &quot;sell 100 at $5.04&quot;. To express a view across a range, they post a ladder of
        orders and keep re-pricing it as the market moves. Every re-price is a transaction. On an AMM the maker gives up control instead: the pool
        picks the curve, and liquidity sits across prices the maker never chose.
      </P>
      <P>
        Takers have the mirror problem. A large order should be split across many makers at the best combined price, but on NEAR each
        cross-contract call is asynchronous, so filling five makers naively means five transactions that can each fail independently.
      </P>

      <H2>How Ebbflow solves it</H2>
      <UL>
        <li><strong className="text-white">Curves as orders.</strong> A maker deposits once and publishes a price range with a shape. The price moves along the curve as it fills; no re-posting.</li>
        <li><strong className="text-white">One book contract.</strong> All maker inventory lives in <C>{BOOK}</C>, so a swap touching eight makers is local state changes inside a single receipt.</li>
        <li><strong className="text-white">Simulate, then commit.</strong> Every leg is priced against a copy of the state first. If any leg or the taker&apos;s limit fails, nothing changes and the full input is refunded.</li>
        <li><strong className="text-white">Self-refilling liquidity.</strong> Proceeds from an ask fill are added to the same maker&apos;s bid (and vice versa), so a two-sided position keeps quoting both ways without the maker doing anything.</li>
        <li><strong className="text-white">Open to agents.</strong> An off-chain solver returns ready-to-sign transactions, and an MCP server lets AI agents quote and trade under hard budget caps.</li>
      </UL>

      <H2>Architecture</H2>
      <Flow
        steps={[
          { who: "Maker", what: <>Deposits tokens with <C>ft_transfer_call</C> and publishes a position with <C>create_position</C>.</> },
          { who: "Solver (off-chain)", what: <>Reads every curve, finds the cheapest split, returns a signable <C>ft_transfer_call</C> with the legs in its <C>msg</C>.</> },
          { who: "Taker or agent", what: "Signs one transaction. No approvals, no multi-step flow." },
          { who: "Book contract", what: <><C>ft_on_transfer</C> simulates every leg, then commits all of them, pays out and refunds unused input.</> },
          { who: "Maker", what: "Proceeds are recycled to the opposite side and can be withdrawn at any time." },
        ]}
      />

      <H3>Components</H3>
      <Table
        head={["Component", "Where", "What it does"]}
        rows={[
          ["Book contract", <C key="c">contracts/ebbflow</C>, "Rust, near-sdk 5. Holds balances and positions, executes swaps, emits NEP-297 events."],
          ["curve-math", <C key="c">packages/curve-math</C>, "Exact TypeScript port of the contract maths, checked against 400 fixtures from the Rust tests."],
          ["Solver", <C key="c">services/solver</C>, "HTTP API: markets, curves, quotes with optimal routing, simulation, 1Click funding."],
          ["MCP server", <C key="c">services/mcp</C>, "Tools for AI agents with per-trade and daily caps."],
          ["Web app", <C key="c">apps/web</C>, "Trade, Make, Portfolio, Activity, Faucet and Fund pages, plus these docs."],
        ]}
      />

      <H2>A trade in numbers</H2>
      <P>
        The reference book has two makers. Priya sells {fb(400n * 10n ** 24n, 0)} wNEAR on a curve from $5.04 to $5.20; Arjun has a limit order for 100
        wNEAR at $5.06. A taker buys <strong className="text-white">200 wNEAR</strong>:
      </P>
      <Table
        head={["Route", "wNEAR", "tUSDC paid", "Avg price"]}
        align={["l", "r", "r", "r"]}
        rows={[
          ["Priya's curve", fb(route.priyaBase), fq(route.priya.quote), `$${fp(avg(route.priyaBase, route.priya.quote), 4)}`],
          ["Arjun's limit", fb(route.arjunBase), fq(route.arjun.quote), "$5.06"],
          [<strong key="t" className="text-white">Ebbflow route</strong>, "200", <strong key="q" className="text-white">{fq(route.total)}</strong>, `$${fp(route.avgP, 4)}`],
          ["Priya alone", "200", fq(route.solo.quote), `$${fp(avg(route.size, route.solo.quote), 4)}`],
        ]}
      />
      <P>
        Both legs settle in one transaction and the taker saves {fq(route.saving)} tUSDC against the best single maker. The full derivation is in{" "}
        <Link href="/docs/routing" className="text-mint underline decoration-mint/30 underline-offset-[3px]">Routing across makers</Link>.
      </P>

      <H2>Where to go next</H2>
      <Table
        head={["If you want to…", "Read"]}
        rows={[
          ["Make a trade on testnet now", <Link key="l" className="text-mint" href="/docs/quickstart">Quickstart</Link>],
          ["Understand the pricing maths", <Link key="l" className="text-mint" href="/docs/curve-model">The curve model</Link>],
          ["Provide liquidity", <Link key="l" className="text-mint" href="/docs/providing-liquidity">Providing liquidity</Link>],
          ["Integrate from code", <Link key="l" className="text-mint" href="/docs/contract">Contract API</Link>],
          ["Let an AI agent trade", <Link key="l" className="text-mint" href="/docs/mcp">MCP server</Link>],
        ]}
      />
      <Callout type="note" title={`Network: ${NETWORK}`}>
        <p>
          These docs describe the live deployment: book <C>{BOOK}</C>, market 0 = <C>{MARKET.base}</C> / <C>{MARKET.quote}</C>, administered by{" "}
          <C>{OWNER}</C>.
        </p>
      </Callout>
    </>
  );
}

export function Quickstart() {
  return (
    <>
      <Lead>
        This walks you from an empty testnet wallet to a filled multi-maker trade and your own live curve. Every step is one wallet approval.
        Total cost is about 3 NEAR of testnet funds, most of which you can withdraw again.
      </Lead>

      <H2>Before you start</H2>
      <UL>
        <li>A NEAR <strong className="text-white">testnet</strong> account, e.g. from <A href="https://testnet.mynearwallet.com">MyNearWallet</A> or Meteor switched to testnet.</li>
        <li>At least <strong className="text-white">3 NEAR</strong> on it. New MyNearWallet testnet accounts are funded; otherwise ask a teammate to send some.</li>
        <li>The web app open: the hosted URL, or locally with <C>pnpm solver</C> and <C>pnpm web</C> (port 3100).</li>
      </UL>

      <H2>1. Register and fund</H2>
      <Steps>
        <Step title="Connect your wallet">
          <P>Open <Link className="text-mint" href="/faucet">Faucet</Link> and click <strong className="text-white">Connect wallet</strong>. Your NEAR, wNEAR and tUSDC balances appear.</P>
        </Step>
        <Step title="Register storage (one approval)">
          <P>NEAR contracts charge for the bytes your account occupies (NEP-145). Click <strong className="text-white">Register</strong> to pay all three at once:</P>
          <Table
            head={["Contract", "Deposit", "Why"]}
            align={["l", "r", "l"]}
            compact
            rows={[
              [<C key="b">{BOOK}</C>, "0.01 NEAR", "Your book balances (refundable)"],
              [<C key="w">{MARKET.base}</C>, "0.00125 NEAR", "To receive wNEAR"],
              [<C key="u">{MARKET.quote}</C>, "0.00125 NEAR", "To receive tUSDC"],
            ]}
          />
        </Step>
        <Step title="Mint 1,000 tUSDC">
          <P>tUSDC is the test quote token (6 decimals). Anyone can mint up to 10,000 per call. Enter 1000 and approve.</P>
        </Step>
        <Step title="Wrap 2 NEAR">
          <P>Native NEAR isn&apos;t a token contract, so the market trades wrapped NEAR (<C>{MARKET.base}</C>, 24 decimals). Wrap 2 NEAR; keep at least 0.5 NEAR for gas.</P>
        </Step>
      </Steps>

      <H2>2. Make your first trade</H2>
      <Steps>
        <Step title="Get a quote">
          <P>Open <Link className="text-mint" href="/trade">Trade</Link>, choose <strong className="text-white">Buy</strong> and enter 1 wNEAR. The solver returns a route: each leg names a maker, its size and its price.</P>
        </Step>
        <Step title="Check the limits">
          <P>
            For a buy, the amount you attach is the quoted cost plus 0.5% slippage headroom. You never pay more than the exact cost of the legs; the
            rest is refunded in the same transaction. See <Link className="text-mint" href="/docs/slippage">Slippage &amp; limits</Link>.
          </P>
        </Step>
        <Step title="Swap">
          <P>Approve the single <C>ft_transfer_call</C>. The result screen shows what you received, what you spent, any refund and how many makers filled you.</P>
        </Step>
        <Step title="Verify">
          <P>Your fill appears on <Link className="text-mint" href="/activity">Activity</Link> with a link to the explorer, where you can see the <C>swap</C> and <C>fill</C> events.</P>
        </Step>
      </Steps>

      <H2>3. Publish your own curve</H2>
      <Steps>
        <Step title="Deposit into the book">
          <P>On <Link className="text-mint" href="/make">Make</Link>, deposit 200 tUSDC. It moves from your wallet into your book balance.</P>
        </Step>
        <Step title="Shape a bid">
          <P>Set a bid of 200 tUSDC from $4.98 down to $4.85 with alpha 1. The preview shows how the price falls as it fills. Starting above the best bid makes your curve the first one sellers hit.</P>
        </Step>
        <Step title="Publish">
          <P>Approve <C>create_position</C> with a 0.01 NEAR storage deposit, refunded when you close. The position is live immediately.</P>
        </Step>
        <Step title="Close and withdraw">
          <P>On <Link className="text-mint" href="/portfolio">Portfolio</Link>, close the position (inventory returns to your book balance), then withdraw to your wallet.</P>
        </Step>
      </Steps>

      <Callout type="tip" title="Testing with two wallets">
        <p>The solver never routes you into your own positions. To watch your curve fill, sell into it from a second account.</p>
      </Callout>

      <H2>The same flow from the command line</H2>
      <CodeBlock
        title="near-cli-rs"
        code={`# register on the book (0.01 NEAR) and mint tUSDC
near contract call-function as-transaction ${BOOK} storage_deposit json-args '{}' \\
  prepaid-gas '30 Tgas' attached-deposit '0.01 NEAR' sign-as <you>.testnet network-config testnet sign-with-keychain send
near contract call-function as-transaction ${MARKET.quote} mint json-args '{"amount":"1000000000"}' \\
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as <you>.testnet network-config testnet sign-with-keychain send

# ask the solver for a quote and get a signable transaction back
curl -s -X POST http://localhost:8787/quote -H 'content-type: application/json' \\
  -d '{"market_id":0,"side":"buy_base","base_amount":"1","taker":"<you>.testnet"}' | jq '.tx'`}
      />
    </>
  );
}

export function Concepts() {
  return (
    <>
      <Lead>Ebbflow uses a small vocabulary. Each term below maps to a field or method in the contract.</Lead>

      <H2>Market</H2>
      <P>
        A pair of NEP-141 tokens: a <strong className="text-white">base</strong> (what is bought and sold, here wNEAR) and a{" "}
        <strong className="text-white">quote</strong> (what prices are expressed in, here tUSDC). Market 0 is <C>{MARKET.base}</C> /{" "}
        <C>{MARKET.quote}</C>. Markets are added by the contract owner with <C>add_market</C>.
      </P>

      <H2>Maker and taker</H2>
      <Table
        head={["", "Maker", "Taker"]}
        rows={[
          ["Goal", "Provide liquidity over a price range and earn the spread", "Trade a size now at the best price"],
          ["Action", <><C>create_position</C></>, <><C>ft_transfer_call</C> with a swap message</>],
          ["Funds", "Deposited in the book first", "Sent with the swap, unused part refunded"],
          ["Example", "Priya: sells 5.04→5.20, buys 4.96→4.80", "Rahul: buys 200 wNEAR"],
        ]}
      />

      <H2>Book balance</H2>
      <P>
        Each account has an internal balance per token inside the book contract. Deposits credit it, positions draw from it, closing a position
        and some fills credit it, and <C>withdraw</C> sends it to your wallet. Read it with <C>get_balance</C>.
      </P>

      <H2>Position</H2>
      <P>
        A position belongs to one owner and one market and has up to two <strong className="text-white">sides</strong>: an ask (sells base for
        quote) and a bid (buys base with quote). It also tracks lifetime stats: base sold, quote received, base bought, quote spent and number of
        fills. Each position costs a flat 0.01 NEAR storage deposit, refunded on close.
      </P>

      <H2>Side</H2>
      <Table
        head={["Field", "Ask", "Bid"]}
        rows={[
          [<C key="r">remaining</C>, "Base still for sale", "Quote still available to buy with"],
          [<C key="s">start_price</C>, "Lowest price (first unit sold)", "Highest price (first unit bought)"],
          [<C key="c">current_price</C>, "Marginal price now; rises as it fills", "Marginal price now; falls as it fills"],
          [<C key="e">end_price</C>, "Highest price (last unit)", "Lowest price (last unit)"],
          [<C key="a">alpha</C>, "Shape 0–3, exponent k = α + 1", "Same"],
        ]}
      />
      <P>A limit order is a side whose start and end prices are equal. It runs through the same code path with a flat price.</P>

      <H2>Leg and route</H2>
      <P>
        A <strong className="text-white">leg</strong> is one fill against one position: <C>{`{ position_id, base_amount }`}</C>. A{" "}
        <strong className="text-white">route</strong> is a list of up to 8 legs, at most one per position, that together make up a swap. The
        solver computes routes; the contract only validates and executes them.
      </P>

      <H2>Recycling</H2>
      <P>
        When an ask fills, the quote proceeds are added to the same position&apos;s bid. When a bid fills, the base proceeds are added to the ask.
        If the opposite side doesn&apos;t exist, proceeds go to the maker&apos;s book balance. See <Link className="text-mint" href="/docs/recycling">Recycling</Link>.
      </P>

      <H2>Solver</H2>
      <P>
        An off-chain, stateless service that reads the book over RPC and turns &quot;buy 200 wNEAR&quot; into a route and a ready-to-sign
        transaction. It is a convenience, not a trust assumption: the contract re-prices every leg and enforces your limits, so a wrong or stale
        route can only be refunded, never mis-filled.
      </P>

      <H2>Prices and units</H2>
      <P>
        Amounts on-chain are integers in each token&apos;s smallest unit. Prices are quote atoms per whole base unit, multiplied by 10¹². The
        price $5.04 is stored as <C>5040000000000000000</C>. See <Link className="text-mint" href="/docs/units-and-precision">Units &amp; precision</Link>.
      </P>
    </>
  );
}
