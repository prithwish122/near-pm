import Link from "next/link";
import { BOOK, MARKET } from "@/lib/config";
import { askStep, B, fb, fp, fq, P as price, PRIYA, Q, recycle } from "@/lib/docs/calc";
import { C, Callout, CodeBlock, Flow, H2, H3, Lead, P, Step, Steps, Table, UL } from "../ui";

const createArgs = {
  market_id: 0,
  ask: { amount: B(PRIYA.ask.amount).toString(), start_price: price(PRIYA.ask.start).toString(), end_price: price(PRIYA.ask.end).toString(), alpha: 1 },
  bid: { amount: Q(PRIYA.bid.amount).toString(), start_price: price(PRIYA.bid.start).toString(), end_price: price(PRIYA.bid.end).toString(), alpha: 1 },
};

export function ProvidingLiquidity() {
  return (
    <>
      <Lead>
        A maker deposits inventory into the book, then publishes a position with an ask, a bid or both. This page walks through Priya&apos;s
        two-sided position from the reference book.
      </Lead>

      <H2>Plan the position</H2>
      <Table
        head={["", "Ask (sell wNEAR)", "Bid (buy wNEAR)"]}
        rows={[
          ["Inventory", `${PRIYA.ask.amount} wNEAR`, `${PRIYA.bid.amount} tUSDC`],
          ["Start price", `$${PRIYA.ask.start}`, `$${PRIYA.bid.start}`],
          ["End price", `$${PRIYA.ask.end}`, `$${PRIYA.bid.end}`],
          ["Shape", "α = 1", "α = 1"],
          ["Meaning", "Sell from $5.04, rising to $5.20 as it fills", "Buy from $4.96, falling to $4.80 as it fills"],
        ]}
      />
      <P>The bid must start strictly below the ask ($4.96 &lt; $5.04), otherwise the position would trade against itself and is rejected with <C>E15_CROSSED_POSITION</C>. The $0.08 gap is Priya&apos;s quoted spread.</P>

      <H2>Steps</H2>
      <Steps>
        <Step title="Register with the book">
          <P>One-time <C>storage_deposit</C> of 0.01 NEAR on <C>{BOOK}</C>. Registration is required before the book accepts deposits.</P>
        </Step>
        <Step title="Deposit inventory">
          <P>One <C>ft_transfer_call</C> per token, with <C>{`msg: {"action":"deposit"}`}</C>. The amount is credited to your book balance and a <C>deposit</C> event is emitted.</P>
          <CodeBlock
            code={`near contract call-function as-transaction ${MARKET.base} ft_transfer_call \\
  json-args '{"receiver_id":"${BOOK}","amount":"${B(PRIYA.ask.amount)}","msg":"{\\"action\\":\\"deposit\\"}"}' \\
  prepaid-gas '60 Tgas' attached-deposit '1 yoctoNEAR' sign-as <you> network-config testnet sign-with-keychain send`}
          />
        </Step>
        <Step title="Publish the position">
          <P>Call <C>create_position</C> with 0.01 NEAR attached for storage (any excess is refunded). Both sides are debited from your book balance in the same call.</P>
          <CodeBlock lang="json" title="create_position args" code={JSON.stringify(createArgs, null, 2)} />
          <P>The call returns the new position id and emits <C>position_created</C> with the full position. It is routable from the next block.</P>
        </Step>
        <Step title="Let it trade">
          <P>No further action is needed. Fills move the curve, proceeds recycle to the other side, and the position&apos;s stats track everything.</P>
        </Step>
      </Steps>

      <H2>Encoding prices</H2>
      <P>
        Prices are raw integers: human price × 10^quote_decimals × 10¹². For tUSDC (6 decimals), $5.04 becomes <C>{price("5.04").toString()}</C>.
        The web app and <C>parsePrice()</C> from <C>@ebbflow/curve-math</C> do this for you.
      </P>

      <H2>Choosing parameters</H2>
      <UL>
        <li><strong className="text-white">Range.</strong> The start is where you are happy to trade the first unit; the end is the worst price you&apos;ll accept for the last. A wider range quotes more conservatively.</li>
        <li><strong className="text-white">Shape.</strong> Higher α concentrates liquidity near the start, so you win more flow near the market. See <Link className="text-mint" href="/docs/curve-shapes">Curve shapes</Link>.</li>
        <li><strong className="text-white">Two sides or one.</strong> A two-sided position recycles, so it keeps earning the spread. A one-sided position sends proceeds to your book balance.</li>
        <li><strong className="text-white">Limit order.</strong> Set start = end for a fixed price.</li>
      </UL>

      <H2>Costs</H2>
      <Table
        head={["Item", "Amount", "Refundable"]}
        align={["l", "r", "l"]}
        rows={[
          ["Book registration", "0.01 NEAR", "Kept for the account"],
          ["Per position storage", "0.01 NEAR", "Yes, on close_position"],
          ["Trading fees", "none", "—"],
          ["Gas", "~30 Tgas per create / close", "No (≈ 0.003 NEAR)"],
        ]}
      />
      <Callout type="warn" title="Custody">
        <p>
          Inventory in a position is held by the book contract, not your wallet. Only you can close your positions or withdraw your balances, and
          funds are segregated per account. See <Link className="text-mint" href="/docs/security">Guarantees &amp; trust model</Link>.
        </p>
      </Callout>
    </>
  );
}

export function Recycling() {
  const r = recycle;
  return (
    <>
      <Lead>
        Recycling is what makes Ebbflow liquidity self-refilling: when one side of a position fills, the proceeds are added to the other side of
        the same position, in the same receipt.
      </Lead>

      <H2>The rule</H2>
      <Table
        head={["Fill", "Proceeds", "Go to", "If that side doesn't exist"]}
        rows={[
          ["Ask fills (taker buys)", "quote", <><C>bid.remaining</C> += proceeds</>, "maker's quote book balance"],
          ["Bid fills (taker sells)", "base", <><C>ask.remaining</C> += proceeds</>, "maker's base book balance"],
        ]}
      />
      <P>
        The receiving side keeps its <C>current_price</C> and <C>end_price</C>. It simply has more inventory to spread over the same remaining
        range. Each <C>fill</C> event reports <C>recycled_amount</C> and <C>recycled_to</C> (<C>&quot;bid&quot;</C>, <C>&quot;ask&quot;</C> or{" "}
        <C>&quot;balance&quot;</C>).
      </P>

      <H2>Worked example</H2>
      <H3>1 · A taker buys 100 wNEAR from Priya</H3>
      <P>They pay {fq(askStep.quote)} tUSDC (see <Link className="text-mint" href="/docs/worked-example">Worked example</Link>). That quote is recycled into Priya&apos;s bid:</P>
      <Table
        head={["Priya's bid", "Before", "After"]}
        align={["l", "r", "r"]}
        rows={[
          [<C key="r">remaining</C>, `${fq(r.bidBefore)} tUSDC`, `${fq(r.bidAfter)} tUSDC`],
          [<C key="c">current_price</C>, "$4.96", "$4.96 (unchanged)"],
          ["Capacity (base it can buy)", `${fb(r.capBefore)} wNEAR`, `${fb(r.capAfter)} wNEAR`],
        ]}
      />
      <H3>2 · Another taker sells 100 wNEAR back</H3>
      <P>
        They hit the refilled bid and receive {fq(r.sell.quote)} tUSDC. The 100 wNEAR is recycled into Priya&apos;s ask, whose remaining returns to
        400 wNEAR. Its price stays at ${fp(askStep.newPrice)}: recycling adds inventory, it doesn&apos;t reset the curve.
      </P>
      <H3>3 · Net result for Priya</H3>
      <Table
        head={["", "wNEAR", "tUSDC"]}
        align={["l", "r", "r"]}
        rows={[
          ["Sold 100 on the ask", "−100", `+${fq(askStep.quote)}`],
          ["Bought 100 on the bid", "+100", `−${fq(r.sell.quote)}`],
          [<strong key="n" className="text-white">Net</strong>, "0", <strong key="s" className="text-emerald">+{fq(r.spread)}</strong>],
        ]}
      />
      <P>She captured the spread on a round trip without signing a single transaction after creating the position.</P>

      <H2>Why it matters</H2>
      <Flow
        steps={[
          { who: "Without recycling", what: "Proceeds sit idle until the maker notices, withdraws and re-posts. Each re-post is a transaction and a gap in quoting." },
          { who: "With recycling", what: "Proceeds are quoting on the other side in the same receipt. Liquidity ebbs from one side and flows back to the other." },
        ]}
      />
    </>
  );
}

export function ManagingPositions() {
  const r = recycle;
  return (
    <>
      <Lead>Track a position with its on-chain stats, close it to reclaim inventory, and withdraw balances to your wallet.</Lead>

      <H2>Reading a position</H2>
      <CodeBlock
        code={`near contract call-function as-read-only ${BOOK} get_positions_by_owner \\
  json-args '{"account_id":"<you>"}' network-config testnet now`}
      />
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [<C key="a">ask / bid</C>, "Current state of each side: remaining, start, current and end price, alpha."],
          [<C key="b">bid_base_capacity</C>, "Base the bid could still buy if fully consumed."],
          [<C key="c">stats.base_sold</C>, "Lifetime base sold on the ask."],
          [<C key="d">stats.quote_received</C>, "Lifetime quote received for it."],
          [<C key="e">stats.base_bought</C>, "Lifetime base bought on the bid."],
          [<C key="f">stats.quote_spent</C>, "Lifetime quote spent on it."],
          [<C key="g">stats.fills</C>, "Number of fills."],
        ]}
      />

      <H2>Working out P&amp;L</H2>
      <P>From the stats after the round trip on the <Link className="text-mint" href="/docs/recycling">Recycling</Link> page:</P>
      <Table
        head={["Stat", "Value"]}
        align={["l", "r"]}
        rows={[
          ["base_sold", "100 wNEAR"],
          ["quote_received", `${fq(askStep.quote)} tUSDC`],
          ["base_bought", "100 wNEAR"],
          ["quote_spent", `${fq(r.sell.quote)} tUSDC`],
        ]}
      />
      <P>
        Realised spread on matched volume = quote_received − quote_spent for equal base = <strong className="text-white">{fq(r.spread)} tUSDC</strong>.
        Any unmatched base (base_sold ≠ base_bought) is inventory exposure; value it at the current market price.
      </P>

      <H2>Closing</H2>
      <P>
        <C>close_position(position_id)</C> with 1 yoctoNEAR attached. Remaining ask base and bid quote return to your book balance, the 0.01 NEAR
        storage deposit is refunded to your wallet, and <C>position_closed</C> is emitted. Only the owner can close (<C>E11_NOT_OWNER</C>), and
        closing works even when trading is paused.
      </P>

      <H2>Withdrawing</H2>
      <P>
        <C>withdraw(token_id, amount?)</C> with 1 yoctoNEAR. Omit <C>amount</C> (or pass <C>null</C>) to withdraw everything. You must be
        registered with the token contract to receive it; if the transfer fails the balance is restored.
      </P>
      <CodeBlock
        code={`near contract call-function as-transaction ${BOOK} withdraw \\
  json-args '{"token_id":"${MARKET.quote}","amount":null}' \\
  prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as <you> network-config testnet sign-with-keychain send`}
      />

      <H2>Updating a curve</H2>
      <P>
        Positions are immutable once published. To change a range or shape, close the position and create a new one; both calls together take a
        few seconds and the inventory never leaves the book.
      </P>
    </>
  );
}
